from fastapi import FastAPI
import spacy
from pydantic import BaseModel
from typing import List, Dict
import re

class Request(BaseModel):
    text: str
    language: str


class Response(BaseModel):
    sentences: List
    entities: Dict
    formated_input: Dict

app = FastAPI()

NER_MODELS = {
    'de': spacy.load('de_core_news_md'),
    'en': spacy.load('en_core_web_md')
}

SPACY_TAGS = ['PERSON', 'ORG', 'GPE', 'LOC', 'NORP']

def get_ner_model(lang: str):
    if lang == 'en':
        return NER_MODELS['en']
    if lang == 'de':
        return NER_MODELS['de']
    
    model = spacy.blank('en')
    if 'parser' not in model.pipe_names:
        model.add_pipe('sentencizer')

    return model

def map_ner_tag(tag: str):
    match tag:
        case 'PERSON': return 'PER'
        case 'LOCATION' | 'LOC': return 'LOC'
        case 'NORP' | 'ORGANISATION' | 'ORG': return 'ORG'
    
    return 'ORG'

def is_valid_entity(text: str, tag: str) -> bool:
    if not text:
        return False
    if len(text) < 2:
        return False
    if re.search(r"https?://", text, re.IGNORECASE):
        return False
    if not re.search(r"[A-Za-zÄÖÜäöüß]", text):
        return False
    if len(text.split()) > 8:
        return False
    return True

def normalize_entity(text: str) -> str:
    if not text:
        return ''
    t = text.strip()
    t = re.sub(r"^[\s'\"()\[\]{}/\\-]+", '', t)
    t = re.sub(r"[\s'\"()\[\]{}/\\.,;:!?-]+$", '', t)
    t = re.sub(r"\s+", ' ', t)
    return t.strip()


@app.post('/ner', response_model=Response)
def ner(request: Request):
    text = request.text
    language = request.language

    nlp = get_ner_model(lang=language)
    doc = nlp(text)

    entities = {}
    sentences = []
    formated_input = {}

    for sent_idx, sent in enumerate(doc.sents):
        ents = []
        ent_names_for_sentence = []
        for ent in sent.ents:
            label = ent.label_
            if label not in SPACY_TAGS:
                continue

            tag = map_ner_tag(label)
            norm = normalize_entity(ent.text)
            if not is_valid_entity(norm, tag):
                continue

            ents.append(ent)
            ent_names_for_sentence.append(norm)

            if norm not in entities:
                tokens_count = len(norm.split())
                entities[norm]= {
                    'type': tag,
                    'value': norm.split()[0],
                    'tokens': tokens_count,
                    'multiword': None if tokens_count < 2 else norm,
                    'caption': ent.text,
                    'count': 1,
                    'sent_idx': [sent_idx],
                }
            else:
                entities[norm]['count'] += 1
                entities[norm]['sent_idx'].append(sent_idx)

        sentence = sent.text.strip()
        if len(ents) > 1:
            formated_input[f'sentence{sent_idx}'] = {
                'text': sentence,
                'entities': ent_names_for_sentence,
            }
        
        tokens = []
        for token_idx, token in enumerate(sent):
            tag = 'O'
            for ent in ents:
                if token.idx >= ent.start_char and token.idx < ent.end_char:
                    tag = map_ner_tag(ent.label_)
                    break
            tokens.append({
                'index': token_idx + 1,
                'word': token.text,
                'originalText': token.text,
                'ner': tag,
            })
        sentences.append({
            'index': sent_idx,
            'parse': 'SENTENCE_SKIPPED_OR_UNPARSABLE',
            'tokens': tokens,
            'text': sentence,
        })

    return Response(sentences=sentences, entities=entities, formated_input=formated_input)
    







