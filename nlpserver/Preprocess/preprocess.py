from fastapi import FastAPI
import re
from langdetect import detect, LangDetectException
from pydantic import BaseModel

class Request(BaseModel):
    text: str

class Response(BaseModel):
    cleaned_text: str
    language: str

app = FastAPI()

def clean_text(text: str) -> str:
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[^a-zA-Z0-9.,;:!?()\"'%\-\s]", "", text)
    return text

def detect_language(text: str) -> str:
    try:
        language = detect(text) if text.strip() else 'en'
    except LangDetectException:
        language = 'en'

    return language


@app.post('/preprocess', response_model=Response)
def preprocess(reqest: Request):
    raw_text = reqest.text
    text = clean_text(raw_text)
    language = detect_language(text)

    return Response(cleaned_text=text, language=language)