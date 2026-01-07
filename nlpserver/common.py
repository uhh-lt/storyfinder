from __future__ import annotations
import json, os, re, itertools
from collections import OrderedDict
import spacy

from openai import OpenAI
from base_config import (
    API_KEY, BASE_URL, ERROR_LOG_PATH,
    ROOT, MODEL_SUMMARY, TEMPERATURE_SUMMARY, USER_FILE_SUMMARY,SYSTEM_FILE_SUMMARY,
    MODEL_CHAT, TEMPERATURE_CHAT, USER_FILE_CHAT, SYSTEM_FILE_CHAT
)

debug = False

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

def get_api_key():
    return API_KEY, BASE_URL

def dump_entities_answer_prompt(entities: OrderedDict, answer: str, prompt: str):
    dump = ''
    dump += prompt + '\n\n'
    for i, (key, _) in enumerate(entities.items()):
        dump += f'{key}, '
        if (i + 1) % 5 == 0:
            dump += '\n'

    dump += '\n\n' + answer

    with open(f'{ROOT}/data/model_answer.txt', 'w', encoding='utf-8') as f:
        f.write(dump)

NLP_CACHE = {}
def _ensure_sentencizer(nlp_pipe):
    try:
        if 'parser' not in nlp_pipe.pipe_names:
            nlp_pipe.add_pipe('sentencizer')
    except Exception as e:
        print(f"Error adding sentencizer: {e}")

def _load_spacy_model(candidates):
    for name in candidates:
        try:
            if name in NLP_CACHE:
                return NLP_CACHE[name]
            pipe = spacy.load(name)
            _ensure_sentencizer(pipe)
            NLP_CACHE[name] = pipe
            return pipe
        except Exception as e:
            print(f"Failed to load spaCy model '{name}': {e}")
    raise ValueError(f"None of the specified spaCy models could be loaded: {candidates}")
    
def _detect_language(text: str) -> str:
    try:
        from langdetect import detect as _ldetect
        code = _ldetect(text)
        if code.startswith('de'):
            return 'de'
        if code.startswith('en'):
            return 'en'
        
    except Exception as e:
        print(f"Language detection failed: {e}. Defaulting to English.")
        return 'en'
    
    lower = text.lower()
    if re.search(r'[äüöß]', lower):
        return 'de'
    
    de_sw = {'und','die','der','das','ist','nicht','für','mit','im','dem','den','ein','eine','zu','auf'}
    en_sw = {'the','and','is','are','to','of','in','for','with','on','a','an'}
    tokens = re.findall(r"\b\w+\b", lower)
    if not tokens:
        return 'en'
    de_count = sum(1 for t in tokens if t in de_sw)
    en_count = sum(1 for t in tokens if t in en_sw)
    return 'de' if de_count > en_count else 'en'

def _get_nlp_for_text(text: str):
    lang = _detect_language(text)
    if lang == 'de':
        pipe = _load_spacy_model(['de_core_news_md'])
        if pipe:
            return pipe
    else:
        pipe = _load_spacy_model(['en_core_web_md'])
        if pipe:
            return pipe
    
    pipe = _load_spacy_model(['xx_ent_wiki_sm'])
    if pipe:
        return pipe
    
    pipe = spacy.blank('en')
    _ensure_sentencizer(pipe)
    return pipe

def map_ner_tag(tag: str):
    match tag:
        case 'PERSON': return 'PER'
        case 'LOCATION' | 'LOC': return 'LOC'
        case 'NORP' | 'ORGANISATION' | 'ORG': return 'ORG'
    
    return 'ORG'


def normalize_entity(text: str) -> str:
    if not text:
        return ''
    t = text.strip()
    t = re.sub(r"^[\s'\"()\[\]{}/\\-]+", '', t)
    t = re.sub(r"[\s'\"()\[\]{}/\\.,;:!?-]+$", '', t)
    t = re.sub(r"\s+", ' ', t)
    return t.strip()


def _is_valid_entity2(text: str, tag: str) -> bool:
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

def dump_entities_answer_prompt(entities: OrderedDict, answer: str, prompt: str):
    dump = ''
    dump += prompt + '\n\n'
    for i, (key, _) in enumerate(entities.items()):
        dump += f'{key}, '
        if (i + 1) % 5 == 0:
            dump += '\n'

    dump += '\n\n' + answer

    with open(f'{ROOT}/data/model_answer.txt', 'w', encoding='utf-8') as f:
        f.write(dump)


def dump_faulty_json(json_like_object):
    files = os.listdir(ERROR_LOG_PATH)
    with open(os.path.join(ERROR_LOG_PATH, f'out{len(files)}.txt'), 'w') as f:
        f.write(json_like_object)



def build_chat_prompt(system_file: str, user_file: str, question: str, context: str):
    """
    Build a 2-message prompt from files for the simple (no-history) case.
    Supports optional placeholders [CONTEXT] and [QUESTION] in the user file.
    Falls keine Platzhalter existieren, wird der Text sinnvoll angehängt.
    """
    system_prompt = open(system_file, 'r', encoding='utf-8').read().strip()
    user_prompt = open(user_file, 'r', encoding='utf-8').read().strip()

    if "[CONTEXT]" in user_prompt:
        user_prompt = user_prompt.replace("[CONTEXT]", context)
    else:
        user_prompt = f"{user_prompt}\n\nContext:\n{context}"

    if "[QUESTION]" in user_prompt:
        user_prompt = user_prompt.replace("[QUESTION]", question)
    else:
        user_prompt = f"{user_prompt}\n\nQuestion:\n{question}\n\nAnswer briefly and clearly."

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

def build_messages_with_files(system_file: str, user_file: str, history_messages: list,
                              context: str | None = None, question: str | None = None):
    """
    Build an OpenAI 'messages' array for the history case.
    - Prepend system prompt from file.
    - Append normalized history (expects 'user'|'assistant'|'system').
    - Inject context (as extra 'system' msg) OR via placeholders in the tail file.
    - Append a final system tail built from user_file (with [CONTEXT]/[QUESTION] replacement).
    """
    system_prompt = open(system_file, 'r', encoding='utf-8').read().strip()
    msgs = [{"role": "system", "content": system_prompt}]

    # Normalize & append history (skip empties)
    for m in history_messages:
        role = (m.get("role") or "").strip().lower()
        if role not in ("user", "assistant", "system"):
            role = "user"
        content = (m.get("content") or "").strip()
        if content:
            msgs.append({"role": role, "content": content})

    # Optional: lightweight dedupe of immediate duplicates (same role+content back-to-back)
    if len(msgs) >= 2:
        dedup = [msgs[0]]
        for m in msgs[1:]:
            if not (m["role"] == dedup[-1]["role"] and m["content"] == dedup[-1]["content"]):
                dedup.append(m)
        msgs = dedup

    # Build tail from user_file with placeholders (preferred)
    tail = ""
    try:
        tail = open(user_file, 'r', encoding='utf-8').read().strip()
    except Exception:
        tail = ""

    # If the tail contains placeholders, replace them; otherwise optionally inject context separately
    if tail:
        if "[CONTEXT]" in tail:
            tail = tail.replace("[CONTEXT]", (context or ""))
        if "[QUESTION]" in tail:
            tail = tail.replace("[QUESTION]", (question or ""))

        # If no [CONTEXT] placeholder present but a context exists, inject a dedicated system message
        if "[CONTEXT]" not in tail and context:
            msgs.append({"role": "system", "content": f"Context:\n{context}"})

        # Add the (now rendered) tail as a system reminder
        if tail.strip():
            msgs.append({"role": "system", "content": tail.strip()})
    else:
        # No tail file? still inject context if available
        if context:
            msgs.append({"role": "system", "content": f"Context:\n{context}"})

    return msgs


def build_prompt(sys_file, us_file, sents: str | None = None):
    system_prompt = open(sys_file, 'r', encoding='utf-8').read().strip()
    user_prompt = open(us_file, 'r', encoding='utf-8').read().strip()

    if sents is not None:
        if "[TEXT]" in user_prompt:
            user_prompt = user_prompt.replace("[TEXT]", sents)
        else:
            user_prompt = f"{user_prompt}\n\n{sents}"

    return [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt}
    ]


def extract_relations(relations: str, entities: OrderedDict):
    output = OrderedDict()

    try:
        pattern = r'\{[\s\S]*\}$'
        matches = re.findall(pattern, relations, re.DOTALL)
        if not matches:
            if debug:
                print('No JSON-like output found in string')
            return output
        
        try:
            relations = json.loads(matches[-1]) #model can actually create multiple json like strings, but the last one generated is always our output
        except json.JSONDecodeError as e:
            if debug:
                print(f'Failed to parse JSON from matched relation string: {e}')
                dump_faulty_json(relations)
            return output
        
        
        for key, value in relations.items():
            try:
                if 'relations' not in value:
                    if debug:
                        print(f'Missing relations string in value')
                    continue
            
                sent_idx = int(key.replace('sentence', ''))
                relation = value.get('relations', None)
                ents = entities.get(key, {}).get('entities', [])

                
                for rel in relation:
                    rel = rel.strip()
                    match = re.match(r'(\d+)(\([\s\S]+\))(\d+)', rel)
                    if not match:
                        if debug:
                            print(f'Invalid relation format: \'{rel}\' in sentence {sent_idx}')
                        continue
                    #ToDo: Write failsafe, if model generated indices, which are not present in entities dict
                    index1, relation_label, index3 = int(match.group(1)), match.group(2).strip('()'), int(match.group(3))
                    
                    if index1 >= len(ents) or index3 >= len(ents):
                        if debug:
                            print(f'Entity index out of range for sentence {sent_idx}: \'{rel}\'')
                        continue
                    if index1 >= index3:
                        if debug:
                            print(f'Entity order not valid or entities are the same in sentence {sent_idx}: \'{rel}\'')
                        continue
                    
                    ent1, ent2 = ents[index1], ents[index3]
                    output.setdefault(ent1, {}).setdefault(ent2, {'positions': [], 'relations': []})
                    output[ent1][ent2]['positions'].append(sent_idx)
                    output[ent1][ent2]['relations'].append(relation_label)

                #Add empty relations for co occuring entities, only if they don't already share a relation
                for ent1, ent2 in itertools.combinations(ents, 2):
                    if ent1 == ent2:
                        continue
                    if (ent1 in output and ent2 in output[ent1]) or (ent2 in output and ent1 in output[ent2]):
                        continue
                    output.setdefault(ent1, {}).setdefault(ent2, {'positions': [], 'relations': []})
                    output[ent1][ent2]['positions'].append(sent_idx)
                    output[ent1][ent2]['relations'].append('')
            
            except Exception as e:
                if debug:
                    print(f'Error processing sentence \'{key}\' and relation {value}: {e}')
                continue
            
    except Exception as e:
        print(f'Unexpected error in extract_relations: {e}')
       
    return output

__all__ = [
    "client", "debug",
    "_get_nlp_for_text", "map_ner_tag", "_normalize_entity_text2", "_is_valid_entity2",
    "build_prompt","build_chat_prompt","build_messages_with_files",
    "get_relation","extract_relations",
    "MODEL_SUMMARY","TEMPERATURE_SUMMARY","SYSTEM_FILE_SUMMARY","USER_FILE_SUMMARY",
    "MODEL_CHAT","TEMPERATURE_CHAT","SYSTEM_FILE_CHAT","USER_FILE_CHAT"
]
