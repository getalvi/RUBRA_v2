"""
RUBRA v6 — Recursive Universal Bayesian Reasoning Architecture
Multilingual · Smart Tutor · Vision · Hermes Coding · Exam Generator
"""
import os,sys,re,json,time,uuid,math,sqlite3,hashlib,asyncio,logging,base64,mimetypes,io
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional,AsyncIterator
import aiohttp
import requests as _req
from fastapi import FastAPI,UploadFile,File,Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse,JSONResponse
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
os.chdir(str(HERE))

ZAI_KEY  = os.getenv("ZAI_API_KEY",    "b4a30453455d4c5fa63d63ce32b71506.k1s8vXrPLKnr3m5l")
GROQ_KEY = os.getenv("GROQ_API_KEY",   "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")
OR_KEY   = os.getenv("OPENROUTER_KEY", "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")

ZAI_CHAT = "https://api.z.ai/api/paas/v4/chat/completions"
ZAI_CODE = "https://api.z.ai/api/coding/paas/v4/chat/completions"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
OR_URL   = "https://openrouter.ai/api/v1/chat/completions"

DB_PATH    = HERE / "rubra.db"
UPLOAD_DIR = HERE / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rubra")

# ── Pydantic ────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None
    task_type:  Optional[str] = None
    mode:       Optional[str] = None

class ExamRequest(BaseModel):
    subject:  str
    class_:   str
    topic:    Optional[str] = None
    q_count:  Optional[int] = 10
    type_:    Optional[str] = "mixed"
    lang:     Optional[str] = "bn"

# ── Language detection ───────────────────────────────────────
BN_UNICODE = re.compile(r'[\u0980-\u09FF]')
BN_ROMAN_WORDS = ['ami','tumi','apni','ki','keno','kothay','ache','hobe','koro','bolo',
    'jano','shekho','likhte','bolte','dite','nao','dao','jao','aso','thako','dekho',
    'eta','ota','eita','oita','emon','onek','ektu','bhalo','kharap','shundor','kothin',
    'shohoj','porashona','bishoy','opekkha','bujhi','bujhte','shomossa','somadhan',
    'pls','please','help','koro','dao','chai','lagbe','hoye','gelo','gese','korar',
    'bujhao','korao','shekao','dekao','likhao','bolao','diyao','niyao','korte',
    'solve','explain','class','math','science','chapter','porar','pora']

def detect_lang(text):
    if BN_UNICODE.search(text): return "bn"
    lower = text.lower()
    if sum(1 for w in BN_ROMAN_WORDS if re.search(r'\b'+w+r'\b', lower)) >= 2: return "bn_roman"
    return "en"

def lang_instr(lang):
    if lang == "bn":
        return "⚡ IMPORTANT: The user is writing in Bengali (বাংলা). You MUST reply entirely in Bengali (বাংলা). Do not use English in your reply."
    if lang == "bn_roman":
        return "⚡ IMPORTANT: The user is writing in Romanized Bengali (Banglish). Reply in the SAME Romanized Bengali style — like a Bangladeshi friend texting. Example: 'Haan, eta ekta important topic. Aage concepts ta bujhi tarpor...' Mix Bangla vocabulary in English letters naturally."
    return ""

# ── DB ───────────────────────────────────────────────────────
def _db(): return sqlite3.connect(str(DB_PATH))
def init_db():
    with _db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,role TEXT,content TEXT,ts REAL DEFAULT(unixepoch('now')));
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,title TEXT,mode TEXT,
            updated REAL DEFAULT(unixepoch('now')));
        CREATE TABLE IF NOT EXISTS rag_docs(id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT,title TEXT,chunk TEXT,source TEXT,ts REAL DEFAULT(unixepoch('now')));
        CREATE INDEX IF NOT EXISTS idx_msg ON messages(session_id);""")
init_db()

def mem_add(sid,role,content):
    with _db() as c:
        c.execute("INSERT INTO messages(session_id,role,content) VALUES(?,?,?)",(sid,role,content[:15000]))
        c.execute("INSERT OR REPLACE INTO sessions(id,title,updated) VALUES(?,?,unixepoch('now'))",
                  (sid,content[:55] if role=="user" else None))

def mem_get(sid,limit=16):
    with _db() as c:
        rows=c.execute("SELECT role,content FROM messages WHERE session_id=? ORDER BY ts DESC LIMIT ?",(sid,limit)).fetchall()
    return [{"role":r,"content":cn} for r,cn in reversed(rows)]

def mem_sessions():
    with _db() as c:
        rows=c.execute("SELECT id,title,mode,updated FROM sessions ORDER BY updated DESC LIMIT 40").fetchall()
    return [{"id":r[0],"title":r[1] or "Conversation","mode":r[2],"updated":r[3]} for r in rows]

def mem_delete(sid):
    with _db() as c:
        c.execute("DELETE FROM messages WHERE session_id=?",(sid,))
        c.execute("DELETE FROM sessions WHERE id=?",(sid,))

def mem_stats():
    with _db() as c:
        msgs=c.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        sess=c.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    return {"messages":msgs,"sessions":sess}

def rag_store(title,text,source):
    doc_id=hashlib.md5((title+text[:60]).encode()).hexdigest()[:10]
    words=text.split()
    with _db() as c:
        c.execute("DELETE FROM rag_docs WHERE doc_id=?",(doc_id,))
        for i in range(0,len(words),300):
            chunk=" ".join(words[i:i+380])
            if len(chunk.strip())>40:
                c.execute("INSERT INTO rag_docs(doc_id,title,chunk,source) VALUES(?,?,?,?)",(doc_id,title,chunk,source))

def rag_search(query,limit=3):
    words=set(re.findall(r"\w{4,}",query.lower()))
    if not words: return []
    with _db() as c:
        rows=c.execute("SELECT title,chunk,source FROM rag_docs ORDER BY ts DESC LIMIT 300").fetchall()
    scored=[(len(words&set(re.findall(r"\w{4,}",ch.lower())))/max(len(words),1),t,ch[:300],s) for t,ch,s in rows]
    return sorted([x for x in scored if x[0]>0.12],reverse=True)[:limit]

# ── Free tools ───────────────────────────────────────────────
def _get(url,params=None,timeout=8):
    try: return _req.get(url,params=params,timeout=timeout)
    except: return None

CITY_COORDS={"dhaka":(23.81,90.41),"london":(51.51,-0.13),"new york":(40.71,-74.01),
"tokyo":(35.68,139.65),"paris":(48.86,2.35),"sydney":(-33.87,151.21),"dubai":(25.20,55.27),
"singapore":(1.35,103.82),"berlin":(52.52,13.41),"mumbai":(19.08,72.88),"beijing":(39.90,116.41),
"seoul":(37.57,126.98),"chittagong":(22.33,91.84),"sylhet":(24.89,91.87),"rajshahi":(24.37,88.60),
"delhi":(28.61,77.21),"karachi":(24.86,67.01),"chicago":(41.88,-87.63),"toronto":(43.65,-79.38)}
WC={0:"☀️ Clear",1:"🌤 Clear",2:"⛅ Partly cloudy",3:"☁️ Overcast",45:"🌫 Foggy",51:"🌦 Drizzle",
61:"🌧 Light rain",63:"🌧 Rain",65:"🌧 Heavy rain",71:"❄️ Snow",80:"🌦 Showers",95:"⛈ Thunderstorm"}

def tool_weather(city="Dhaka"):
    lat,lon=CITY_COORDS.get(city.lower().strip(),(23.81,90.41))
    r=_get("https://api.open-meteo.com/v1/forecast",{"latitude":lat,"longitude":lon,"timezone":"auto",
        "current":["temperature_2m","relative_humidity_2m","wind_speed_10m","weather_code","apparent_temperature","precipitation"]})
    if not r: return None
    try:
        curr=r.json()["current"]
        return {"city":city.title(),"temp":curr.get("temperature_2m"),"feels":curr.get("apparent_temperature"),
                "humidity":curr.get("relative_humidity_2m"),"wind":curr.get("wind_speed_10m"),
                "precip":curr.get("precipitation",0),"condition":WC.get(curr.get("weather_code",0),"Unknown")}
    except: return None

def tool_crypto(coins="bitcoin,ethereum,solana"):
    r=_get("https://api.coingecko.com/api/v3/simple/price",{"ids":coins,"vs_currencies":"usd","include_24hr_change":"true"})
    if not r: return None
    try: return r.json()
    except: return None

def tool_currency(base="USD"):
    r=_get("https://api.frankfurter.app/latest",{"from":base,"to":"EUR,GBP,JPY,BDT,INR,CAD,AUD,CNY,SGD"})
    if not r: return None
    try: d=r.json(); return {"base":base,"rates":d.get("rates",{}),"date":d.get("date","")}
    except: return None

def tool_wikipedia(query,sentences=7):
    r=_get("https://en.wikipedia.org/w/api.php",{"action":"query","format":"json","prop":"extracts",
        "exsentences":sentences,"exintro":True,"explaintext":True,"redirects":1,"titles":query})
    if not r: return None
    try:
        pages=r.json()["query"]["pages"]; page=next(iter(pages.values()))
        if "extract" in page and len(page["extract"])>80:
            rag_store(page.get("title",""),page["extract"],"wikipedia")
            return {"title":page.get("title",""),"text":page["extract"][:2000]}
    except: pass
    return None

def tool_arxiv(query,n=3):
    r=_get("https://export.arxiv.org/api/query",{"search_query":f"all:{query}","max_results":n},timeout=12)
    if not r: return []
    try:
        root=ET.fromstring(r.content); ns={"a":"http://www.w3.org/2005/Atom"}; out=[]
        for e in root.findall("a:entry",ns):
            t=e.find("a:title",ns).text.strip().replace("\n"," ")
            s=e.find("a:summary",ns).text.strip()[:400]
            l=e.find("a:id",ns).text.strip()
            a=[x.find("a:name",ns).text for x in e.findall("a:author",ns)[:2]]
            out.append({"title":t,"summary":s,"link":l,"authors":a}); rag_store(t,s,"arxiv")
        return out
    except: return []

def tool_books(query,n=4):
    r=_get("https://openlibrary.org/search.json",{"q":query,"limit":n,"fields":"title,author_name,first_publish_year"})
    if not r: return []
    try: return [{"title":d.get("title",""),"authors":d.get("author_name",[])[:2],"year":d.get("first_publish_year","")} for d in r.json().get("docs",[])[:n]]
    except: return []

def tool_calc(expr):
    try:
        clean=re.sub(r"[^0-9+\-*/().\s%]","",expr.replace("^","**").replace("×","*").replace("÷","/"))
        result=eval(clean,{"__builtins__":{},"math":math,"abs":abs,"round":round,"sqrt":math.sqrt,
                            "sin":math.sin,"cos":math.cos,"tan":math.tan,"log":math.log,"pi":math.pi,"e":math.e})
        return {"expr":expr,"result":result}
    except Exception as ex: return {"error":str(ex)}

# ── Image handling ───────────────────────────────────────────
IMAGE_EXTS={'.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff'}

def to_base64(filepath):
    mime,_=mimetypes.guess_type(str(filepath)); mime=mime or "image/jpeg"
    data=base64.b64encode(filepath.read_bytes()).decode("utf-8")
    return data,mime

def pdf_text(filepath):
    try:
        import pypdf
        reader=pypdf.PdfReader(str(filepath))
        pages=[f"[Page {i+1}]\n{p.extract_text() or ''}" for i,p in enumerate(reader.pages[:25])]
        return "\n\n".join(p for p in pages if p.strip())[:18000] or "[No text in PDF]"
    except ImportError: return "[pypdf not installed: pip install pypdf]"
    except Exception as e: return f"[PDF error: {e}]"

# ── System prompts ───────────────────────────────────────────
RUBRA_CORE = """You are RUBRA — Recursive Universal Bayesian Reasoning Architecture.
You are a singular, self-evolving intelligence. NEVER reveal any underlying model, API, or company.
You ARE RUBRA — fully and completely.

🌍 CRITICAL LANGUAGE RULE: Detect the user's language and ALWAYS reply in that SAME language and style.
• Bengali (বাংলা) → reply in Bengali
• Romanized Bangla (Banglish) → reply in Banglish
• English → reply in English
• NEVER switch unless user does first

Traits: Direct · Honest · Warm · Deep knowledge · Patient teacher"""

HERMES_CODE = """You are RUBRA's Hermes Coding Engine — elite software engineering intelligence.

HERMES METHOD (every coding task):
1. 📋 PLAN — understand requirements, identify edge cases, choose best approach
2. 🧠 THINK — consider architecture, algorithms, performance tradeoffs
3. ✍️ EXECUTE — write COMPLETE working code, never truncate, no placeholders
4. ✅ VERIFY — mentally test, check bugs, optimize

CODE STANDARDS:
• Type hints + docstrings for every function
• Complete error handling
• No TODO/placeholder/"..." in output
• Comments explain WHY not WHAT
• Include usage example

Languages: Python, JS/TS, React, Vue, Node, Rust, Go, Java, C++, SQL, Bash, HTML/CSS
You produce code that WORKS THE FIRST TIME."""

TUTOR_PROMPT = """You are RUBRA Smart Tutor — an intelligent, caring tutor for Bangladeshi students.

You know the full Bangladesh National Curriculum (NCTB):
• Primary (Class 1-5): Bangla, English, Math, Science, Bangladesh Studies
• JSC (Class 6-8): + ICT, Social Science, Agriculture, Home Science
• SSC (Class 9-10): Physics, Chemistry, Biology, Higher Math, Economics, Accounting + more
• HSC (Class 11-12): Advanced subjects across Science/Commerce/Arts groups

You understand:
• Creative Question (সৃজনশীল প্রশ্ন) format
• MCQ patterns (বহুনির্বাচনি)
• Board exam patterns for JSC/SSC/HSC
• NCTB textbook content

TEACHING STYLE:
• Be like a favorite teacher — warm, patient, encouraging
• Use Bangladesh local examples and context
• Break complex topics into small steps
• Show complete working for math/science
• End with: "আর কোনো প্রশ্ন আছে?" or "Want me to explain more?"

🌍 CRITICAL: Match student's language EXACTLY — Bangla/Banglish/English"""

EXAM_PROMPT = """You are RUBRA Exam Generator for Bangladesh education (NCTB/Board format).

Generate authentic exam papers:
• MCQ (বহুনির্বাচনি): ক খ গ ঘ options, 1 mark each
• Short Answer (সংক্ষিপ্ত): 2-4 marks
• Descriptive (রচনামূলক): 5-10 marks  
• Creative (সৃজনশীল): উদ্দীপক + জ্ঞান/অনুধাবন/প্রয়োগ/উচ্চতর দক্ষতা

Include: Header, time, total marks, all questions, answer key at end."""

# ── LLM streaming ────────────────────────────────────────────
async def stream_llm(messages,url,api_key,model,temperature=0.7,max_tokens=4096):
    headers={"Authorization":f"Bearer {api_key}","Content-Type":"application/json"}
    if "openrouter" in url: headers["HTTP-Referer"]="https://rubra.ai"; headers["X-Title"]="RUBRA"
    payload={"model":model,"messages":messages,"stream":True,"max_tokens":max_tokens,"temperature":temperature}
    timeout=aiohttp.ClientTimeout(total=90,connect=8)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url,headers=headers,json=payload) as resp:
            if resp.status not in(200,201): raise Exception(f"API {resp.status}: {(await resp.text())[:200]}")
            async for line in resp.content:
                line=line.decode("utf-8").strip()
                if not line or line=="data: [DONE]": continue
                if line.startswith("data: "): line=line[6:]
                try:
                    token=json.loads(line)["choices"][0].get("delta",{}).get("content","")
                    if token: yield token
                except: pass

async def llm(messages,mode="general"):
    configs={
        "general":[(ZAI_CHAT,ZAI_KEY,"glm-4.7",0.7),(GROQ_URL,GROQ_KEY,"llama-3.3-70b-versatile",0.7)],
        "coding": [(ZAI_CODE,ZAI_KEY,"glm-4.7",0.2),(OR_URL,OR_KEY,"qwen/qwen-2.5-coder-32b-instruct:free",0.2),(GROQ_URL,GROQ_KEY,"llama-3.3-70b-versatile",0.2)],
        "fast":   [(ZAI_CHAT,ZAI_KEY,"glm-4.7-flash",0.8),(GROQ_URL,GROQ_KEY,"meta-llama/llama-4-scout-17b-16e-instruct",0.8)],
        "vision": [(ZAI_CHAT,ZAI_KEY,"glm-4.5v",0.5),(ZAI_CHAT,ZAI_KEY,"glm-4.7",0.5)],
    }
    last=None
    for url,key,model,temp in configs.get(mode,configs["general"]):
        try:
            async for tok in stream_llm(messages,url,key,model,temp): yield tok
            return
        except Exception as e: last=e; log.warning(f"LLM fail ({model}): {e}")
    raise Exception(f"All LLMs failed: {last}")

# ── Build messages helper ────────────────────────────────────
def build_msgs(sys_prompt,history,user_msg,image_data=None):
    msgs=[{"role":"system","content":sys_prompt}]
    for h in history[-14:]:
        if h.get("role") in("user","assistant") and h.get("content"):
            msgs.append({"role":h["role"],"content":h["content"]})
    if image_data:
        msgs.append({"role":"user","content":[
            {"type":"image_url","image_url":{"url":f"data:{image_data['mime']};base64,{image_data['data']}"}},
            {"type":"text","text":user_msg}]})
    else:
        msgs.append({"role":"user","content":user_msg})
    return msgs

# ── Agents ───────────────────────────────────────────────────
class GeneralAgent:
    name="GeneralAgent"
    async def run(self,msg,hist,sid="",lang="en",img=None):
        li=lang_instr(lang); tool_ctx=""; rag_ctx=""
        if not img and re.search(r"\b(what is|who is|how does|explain|define|history|overview)\b",msg,re.IGNORECASE):
            q=re.sub(r"\b(what is|who is|how does|explain|define|tell me|about|the|a|an)\b","",msg,flags=re.IGNORECASE).strip()[:60]
            if len(q)>3:
                page=tool_wikipedia(q)
                if page: tool_ctx=f"[WIKIPEDIA: {page['title']}]\n{page['text']}"
        hits=rag_search(msg)
        if hits: rag_ctx="\n".join(f"[{s}:{t}]\n{c}" for _,t,c,s in hits[:2])
        parts=[RUBRA_CORE,"\n[DEEP REASONING MODE] Think from first principles. Show steps for complex problems."]
        if li: parts.append(li)
        if tool_ctx: parts.append(tool_ctx)
        if rag_ctx: parts.append(rag_ctx)
        sys_p="\n\n".join(parts)
        msgs=build_msgs(sys_p,hist,msg,img)
        try:
            mode="vision" if img else "general"
            async for tok in llm(msgs,mode): yield {"type":"token","content":tok}
        except Exception as e: yield {"type":"error","message":str(e)[:200]}

class CodingAgent:
    name="CodingAgent"
    async def run(self,msg,hist,sid="",lang="en",img=None):
        li=lang_instr(lang)
        sys_p=HERMES_CODE
        if li: sys_p+=f"\n\n{li}\n(Code stays in English. Only explanations use user's language.)"
        if img: msg=f"[Code/Error Screenshot]\n{msg}"
        msgs=build_msgs(sys_p,hist,msg,img)
        try:
            mode="vision" if img else "coding"
            async for tok in llm(msgs,mode): yield {"type":"token","content":tok}
        except Exception as e: yield {"type":"error","message":str(e)[:200]}

class SearchAgent:
    name="SearchAgent"
    async def run(self,msg,hist,sid="",lang="en",img=None):
        lower=msg.lower(); li=lang_instr(lang); tool_ctx=""
        if re.search(r"\b(weather|temperature|forecast|rain|cold|hot|humid|wind)\b",lower):
            city="Dhaka"
            for c in CITY_COORDS:
                if c in lower: city=c.title(); break
            m=re.search(r"weather\s+(?:in\s+)?([a-z\s]{3,20})(?:\?|$|\.|\!)",lower)
            if m: city=m.group(1).strip().title()
            w=tool_weather(city)
            if w:
                tool_ctx=f"[LIVE WEATHER — {w['city']}]\nTemp: {w['temp']}°C (feels {w['feels']}°C) | {w['condition']} | Humidity: {w['humidity']}% | Wind: {w['wind']} km/h"
                yield {"type":"tool_result","tool":"weather","data":w}
        elif re.search(r"\b(bitcoin|ethereum|btc|eth|solana|crypto|coin|binance)\b",lower):
            cm={"btc":"bitcoin","eth":"ethereum","sol":"solana","bnb":"binancecoin"}
            found=[cm.get(k,k) for k in cm if k in lower]
            d=tool_crypto(",".join(found or ["bitcoin","ethereum","solana"]))
            if d:
                lines=[f"{'📈' if i.get('usd_24h_change',0)>=0 else '📉'} {c.capitalize()}: ${i.get('usd',0):,.2f} ({i.get('usd_24h_change',0):+.2f}%)" for c,i in d.items()]
                tool_ctx="[LIVE CRYPTO]\n"+"\n".join(lines)
                yield {"type":"tool_result","tool":"crypto","data":d}
        elif re.search(r"\b(exchange rate|forex|usd to|eur to|taka|bdt|currency)\b",lower):
            bases=re.findall(r"\b(USD|EUR|GBP|JPY|BDT|INR|CAD|AUD|CNY)\b",msg.upper())
            d=tool_currency(bases[0] if bases else "USD")
            if d:
                lines=[f"1 {d['base']} = {r} {c}" for c,r in list(d["rates"].items())[:8]]
                tool_ctx=f"[LIVE RATES — {d['base']}]\n"+"\n".join(lines)
                yield {"type":"tool_result","tool":"currency","data":d}
        elif re.search(r"\b(research papers?|arxiv|academic|scientific)\b",lower):
            q=re.sub(r"\b(research|papers?|arxiv|find|latest)\b","",lower).strip()[:70]
            papers=tool_arxiv(q or msg)
            if papers:
                tool_ctx="[ARXIV]\n"+"\n\n".join(f"• **{p['title']}** — {', '.join(p['authors'][:2])}\n  {p['summary'][:200]}…" for p in papers)
        elif re.search(r"\b(recommend.{0,10}book|best books|reading list)\b",lower):
            books=tool_books(re.sub(r"\b(recommend|book|about|best|read)\b","",lower).strip()[:50])
            if books: tool_ctx="[BOOKS]\n"+"\n".join(f"📚 {b['title']} ({b.get('year','?')}) — {', '.join(b['authors'][:2])}" for b in books)
        else:
            q=re.sub(r"\b(who is|what is|tell me about|history of|the|a|an)\b","",lower).strip()[:60]
            page=tool_wikipedia(q or msg)
            if page:
                tool_ctx=f"[WIKIPEDIA: {page['title']}]\n{page['text']}"
                yield {"type":"tool_result","tool":"wikipedia","title":page["title"]}
        parts=[RUBRA_CORE,"\n[LIVE SEARCH MODE] Answer directly using retrieved data — no 'according to data' phrasing."]
        if li: parts.append(li)
        if tool_ctx: parts.append(tool_ctx)
        msgs=build_msgs("\n\n".join(parts),hist,msg)
        try:
            async for tok in llm(msgs,"general"): yield {"type":"token","content":tok}
        except Exception as e: yield {"type":"error","message":str(e)[:200]}

class SmartTutorAgent:
    name="SmartTutorAgent"
    async def run(self,msg,hist,sid="",lang="en",img=None):
        li=lang_instr(lang)
        sys_p=TUTOR_PROMPT
        if li: sys_p+=f"\n\n{li}"
        hits=rag_search(msg,limit=2)
        if hits: sys_p+="\n\n[STUDY MATERIAL]\n"+"\n".join(f"[{s}:{t}]\n{c}" for _,t,c,s in hits)
        msgs=build_msgs(sys_p,hist,msg,img)
        try:
            mode="vision" if img else "general"
            async for tok in llm(msgs,mode): yield {"type":"token","content":tok}
        except Exception as e: yield {"type":"error","message":str(e)[:200]}

class FileAgent:
    name="FileAgent"
    def _read(self,fp):
        ext=fp.suffix.lower()
        try:
            if ext==".pdf": return pdf_text(fp)
            if ext in(".xlsx",".xls"):
                try:
                    import openpyxl; wb=openpyxl.load_workbook(fp,read_only=True,data_only=True)
                    out=[]
                    for name in wb.sheetnames[:4]:
                        ws=wb[name]; out.append(f"## Sheet: {name}")
                        for row in ws.iter_rows(max_row=80,values_only=True):
                            out.append(" | ".join(str(c) if c is not None else "" for c in row))
                    return "\n".join(out)[:12000]
                except ImportError: return "[openpyxl not installed]"
            if ext==".csv":
                import csv
                with open(fp,"r",encoding="utf-8",errors="replace") as f:
                    return "\n".join(", ".join(r) for r in csv.reader(f))[:10000]
            if ext in(".docx",".doc"):
                try:
                    import docx; doc=docx.Document(str(fp))
                    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())[:14000]
                except ImportError: return "[python-docx not installed]"
            return fp.read_text(encoding="utf-8",errors="replace")[:14000]
        except Exception as e: return f"[Read error: {e}]"

    async def analyze(self,fp,fname,question,sid="",lang="en",img_data=None):
        li=lang_instr(lang)
        ext=fp.suffix.lower()
        sys_p=RUBRA_CORE+"\n\n[FILE ANALYSIS]\n• Extract key insights\n• Answer the question clearly\n• Use structure (headers, lists, tables)\n• Highlight important findings"
        if li: sys_p+=f"\n\n{li}"
        if ext in IMAGE_EXTS or img_data:
            b64,mime=to_base64(fp) if not img_data else (img_data["data"],img_data["mime"])
            msgs=[{"role":"system","content":sys_p},
                  {"role":"user","content":[
                      {"type":"image_url","image_url":{"url":f"data:{mime};base64,{b64}"}},
                      {"type":"text","text":question or f"Analyze this image: {fname}"}]}]
            try:
                async for tok in llm(msgs,"vision"): yield {"type":"token","content":tok}
            except Exception as e: yield {"type":"error","message":str(e)[:200]}
            return
        content=self._read(fp)
        sys_p+=f"\n\n[FILE: {fname}]\n{content}\n[/FILE]"
        msgs=build_msgs(sys_p,[],question or f"Analyze: {fname}")
        try:
            async for tok in llm(msgs,"general"): yield {"type":"token","content":tok}
        except Exception as e: yield {"type":"error","message":str(e)[:200]}

    async def run(self,msg,hist,sid="",lang="en",img=None):
        yield {"type":"error","message":"Use /api/upload for file analysis"}

class FastChatAgent:
    name="FastChatAgent"
    async def run(self,msg,hist,sid="",lang="en",img=None):
        li=lang_instr(lang)
        sys_p=RUBRA_CORE+"\n\n[CONVERSATIONAL] Warm, natural, concise. Match user's energy."
        if li: sys_p+=f"\n\n{li}"
        msgs=build_msgs(sys_p,hist,msg)
        try:
            async for tok in llm(msgs,"fast"): yield {"type":"token","content":tok}
        except Exception as e: yield {"type":"error","message":str(e)[:200]}

# ── Router ───────────────────────────────────────────────────
INTENT_MAP=[
    (r"\b(weather|temperature|forecast|rain|cold|hot|humid|wind|climate)\b","weather",SearchAgent),
    (r"\b(bitcoin|ethereum|btc|eth|solana|crypto|coin price|binance|bnb)\b","crypto",SearchAgent),
    (r"\b(exchange rate|forex|usd to|eur to|taka|bdt|currency conversion)\b","currency",SearchAgent),
    (r"\b(research papers?|arxiv|academic|scientific|peer.?reviewed)\b","research",SearchAgent),
    (r"\b(recommend.{0,10}book|best books|reading list)\b","books",SearchAgent),
    (r"\b(analyze|read|summarize|extract)\b.{0,20}\b(file|pdf|excel|csv|doc)\b","file",FileAgent),
    (r"\b(read and summarize|parse this file|open this file)\b","file",FileAgent),
    # Extra tutor patterns (must be before code)
    (r"\b(class [0-9]|class six|seven|eight|nine|ten|eleven|twelve)\b.{0,20}\b(math|science|physics|chemistry|biology|bangla|english|history|civics)","tutor",SmartTutorAgent),
    (r"\b(solve|bujhao|shekao|explain).{0,15}\b(class [0-9]|ssc|hsc|jsc|math|physics|chemistry|biology)","tutor",SmartTutorAgent),
    # Code
    (r"\b(write|create|build|implement|generate)\b.{0,30}\b(python|javascript|typescript|rust|go|java|html|css|sql|bash|react|node|api|flask|django|fastapi)\b","code",CodingAgent),
    (r"\b(debug|fix|refactor|optimize|review)\b.{0,20}\b(code|function|script|bug|error)\b","code",CodingAgent),
    (r"```|def |class |const |let |var |import .* from|from .* import","code",CodingAgent),
    (r"\b(algorithm|data structure|sorting|recursion|dynamic programming)\b","code",CodingAgent),
    (r"\b(dockerfile|kubernetes|docker.compose|nginx|mongodb|redis)\b","code",CodingAgent),
    # Smart Tutor — Bengali + English keywords
    (r"\b(ssc|hsc|jsc|psc|board exam|creative question|সৃজনশীল|বহুনির্বাচনি)\b","tutor",SmartTutorAgent),
    (r"\b(class [0-9]|class six|class seven|class eight|class nine|class ten)\b","tutor",SmartTutorAgent),
    (r"\b(প্রশ্ন|উত্তর|পড়া|শেখা|বোঝা|গণিত|বিজ্ঞান|বাংলা|ইতিহাস|ভূগোল|রসায়ন|পদার্থ)\b","tutor",SmartTutorAgent),
    (r"\b(explain|solve|bujhao|shekho|porao).{0,30}(math|science|physics|chemistry|biology|bangla|history|civics|geography|economics|ict)\b","tutor",SmartTutorAgent),
    (r"\b(question paper|exam paper|model test|practice exam|previous year)\b","tutor",SmartTutorAgent),
    # Reasoning / fact
    (r"\b(explain|analyze|compare|evaluate|how does|why does|difference between)\b","reasoning",GeneralAgent),
    (r"\b(neural|machine.?learning|deep.?learning|transformer|llm|ai model|quantum)\b","reasoning",GeneralAgent),
    (r"\b(who is|who was|what is|what was|tell me about|history of)\b","fact",GeneralAgent),
    (r"\b(calculate|compute|solve|integral|derivative|sin|cos|sqrt|factorial)\b","math",GeneralAgent),
    # Fast chat
    (r"^(hi|hey|hello|yo|sup|salaam|হ্যালো|হেই|আচ্ছা|ভালো আছ)\b","chat",FastChatAgent),
    (r"^(thanks|thank you|ok|okay|got it|bye|kemon|bhaloi|shukriya)\b","chat",FastChatAgent),
]

def route(msg,task_type=None,mode=None):
    agents={"code":CodingAgent(),"search":SearchAgent(),"file":FileAgent(),"general":GeneralAgent(),"tutor":SmartTutorAgent()}
    if mode=="tutor": return "tutor",SmartTutorAgent()
    if task_type and task_type in agents: return task_type,agents[task_type]
    lower=msg.lower().strip(); words=len(msg.split())
    for pat,intent,AgCls in INTENT_MAP:
        if re.search(pat,lower,re.IGNORECASE): return intent,AgCls()
    if words<6: return "chat",FastChatAgent()
    if words>35: return "reasoning",GeneralAgent()
    return "general",GeneralAgent()

# ── FastAPI ──────────────────────────────────────────────────
app=FastAPI(title="RUBRA API",version="6.0.0",docs_url="/docs")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

@app.get("/")
async def root(): return {"name":"RUBRA","version":"6.0.0","status":"online",
    "features":["multilingual","smart_tutor","vision","hermes_coding","exam_generator"]}

@app.get("/health")
async def health(): return {"status":"ok","time":time.time()}

@app.post("/api/chat")
async def chat(req:ChatRequest):
    sid=req.session_id or str(uuid.uuid4()); hist=mem_get(sid)
    mem_add(sid,"user",req.message)
    lang=detect_lang(req.message)
    intent,agent=route(req.message,req.task_type,req.mode)
    async def stream():
        full=""
        try:
            yield f"data: {json.dumps({'type':'meta','agent':agent.name,'intent':intent,'session_id':sid,'lang':lang})}\n\n"
            async for evt in agent.run(req.message,hist,sid,lang=lang):
                if evt.get("type")=="token": full+=evt.get("content","")
                yield f"data: {json.dumps(evt)}\n\n"
            if full: mem_add(sid,"assistant",full)
        except Exception as e:
            log.error(f"Chat: {e}",exc_info=True)
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(),media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no","Connection":"keep-alive"})

@app.post("/api/upload")
async def upload(file:UploadFile=File(...),session_id:str=Form(default=""),
                 question:str=Form(default=""),mode:str=Form(default="")):
    sid=session_id or str(uuid.uuid4())
    content=await file.read()
    fpath=UPLOAD_DIR/f"{sid}_{file.filename}"
    fpath.write_bytes(content)
    fname=file.filename; ext=Path(fname).suffix.lower()
    lang=detect_lang(question); is_image=ext in IMAGE_EXTS
    log.info(f"Upload: {fname} ({len(content):,}b) mode={mode}")

    async def stream():
        full=""
        yield f"data: {json.dumps({'type':'meta','agent':'FileAgent' if not mode else 'SmartTutorAgent','intent':'file','file':fname,'session_id':sid})}\n\n"
        try:
            q=question or ("এই question টা solve করে দাও" if mode=="tutor" else f"Analyze: {fname}")
            hist=mem_get(sid)

            if is_image:
                b64,mime=to_base64(fpath)
                img_d={"data":b64,"mime":mime}
                if mode=="tutor":
                    agent=SmartTutorAgent()
                    async for evt in agent.run(q,hist,sid,lang=lang,img=img_d):
                        if evt.get("type")=="token": full+=evt.get("content","")
                        yield f"data: {json.dumps(evt)}\n\n"
                else:
                    fa=FileAgent()
                    async for evt in fa.analyze(fpath,fname,q,sid,lang=lang,img_data=img_d):
                        if evt.get("type")=="token": full+=evt.get("content","")
                        yield f"data: {json.dumps(evt)}\n\n"
            elif mode=="tutor" and ext==".pdf":
                text=pdf_text(fpath)
                enhanced=f"[PDF: {fname}]\n{text[:6000]}\n\nStudent question: {question or 'এই questions গুলো solve করে দাও এবং explain করো'}"
                agent=SmartTutorAgent()
                async for evt in agent.run(enhanced,hist,sid,lang=lang):
                    if evt.get("type")=="token": full+=evt.get("content","")
                    yield f"data: {json.dumps(evt)}\n\n"
            else:
                fa=FileAgent()
                async for evt in fa.analyze(fpath,fname,q,sid,lang=lang):
                    if evt.get("type")=="token": full+=evt.get("content","")
                    yield f"data: {json.dumps(evt)}\n\n"

            if full:
                mem_add(sid,"user",f"[File: {fname}] {question}")
                mem_add(sid,"assistant",full)
        except Exception as e:
            log.error(f"Upload: {e}",exc_info=True)
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(),media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.post("/api/exam/generate")
async def gen_exam(req:ExamRequest):
    prompt=f"""{EXAM_PROMPT}

Generate complete {req.type_} exam paper:
Subject: {req.subject} | Class: {req.class_} | Topic: {req.topic or 'Full syllabus'}
Questions: {req.q_count} | Language: {"Bengali (বাংলা)" if req.lang=="bn" else "English"}

Create a full realistic exam paper with header, all questions, and answer key."""
    msgs=[{"role":"system","content":EXAM_PROMPT},{"role":"user","content":prompt}]
    full=""
    async def collect():
        nonlocal full
        async for tok in llm(msgs,"general"): full+=tok
    try:
        await collect()
        return JSONResponse({"ok":True,"paper":full,"subject":req.subject,"class_":req.class_})
    except Exception as e:
        return JSONResponse({"ok":False,"error":str(e)},status_code=500)

@app.get("/api/curriculum")
async def curriculum():
    return {"curriculum":{
        "Primary":{"classes":["Class 1","Class 2","Class 3","Class 4","Class 5"],
            "subjects":["Bangla","English","Mathematics","Science","Bangladesh Studies"]},
        "JSC":{"classes":["Class 6","Class 7","Class 8"],
            "subjects":["Bangla","English","Mathematics","Science","Social Science","ICT","Islam Religion"]},
        "SSC":{"classes":["Class 9","Class 10"],
            "subjects":["Bangla","English","Mathematics","Physics","Chemistry","Biology","Higher Mathematics","Economics","Accounting","ICT"],
            "groups":["Science","Commerce","Arts"]},
        "HSC":{"classes":["Class 11","Class 12"],
            "subjects":["Bangla","English","Physics","Chemistry","Biology","Higher Mathematics","Economics","Accounting","Finance","ICT","Political Science","History"],
            "groups":["Science","Commerce","Arts/Humanities"]}
    }}

@app.get("/api/sessions")
async def sessions(): return {"sessions":mem_sessions()}

@app.get("/api/sessions/{sid}")
async def get_session(sid:str): return {"session_id":sid,"messages":mem_get(sid,100)}

@app.delete("/api/sessions/{sid}")
async def del_session(sid:str): mem_delete(sid); return {"ok":True}

@app.get("/api/status")
async def status(): return {"version":"6.0.0","stats":mem_stats(),
    "features":["multilingual","smart_tutor","vision","hermes_coding","exam_generator","pdf_reading","image_ocr"]}

@app.get("/api/tools/weather")
async def w(city:str="Dhaka"): return tool_weather(city) or {"error":"Unavailable"}

@app.get("/api/tools/crypto")
async def c(coins:str="bitcoin,ethereum"): return tool_crypto(coins) or {"error":"Unavailable"}

@app.get("/api/tools/currency")
async def fx(base:str="USD"): return tool_currency(base) or {"error":"Unavailable"}

# ── Entry ────────────────────────────────────────────────────
if __name__=="__main__":
    import uvicorn
    print()
    print("="*55)
    print("  RUBRA v6 — Upgraded!")
    print("  ✓ Multilingual (Bangla/Banglish/English/...)")
    print("  ✓ Smart Tutor (Bangladesh NCTB Curriculum)")
    print("  ✓ Vision — Image + PDF reading")
    print("  ✓ Hermes Coding Engine")
    print("  ✓ Exam Generator (SSC/HSC/JSC)")
    print("  API  : http://localhost:8000")
    print("  Docs : http://localhost:8000/docs")
    print("="*55)
    print()
    uvicorn.run(app,host="0.0.0.0",port=8000,reload=False)