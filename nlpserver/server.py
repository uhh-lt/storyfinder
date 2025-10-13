import json
from flask import Flask, request, jsonify
import spacy 
from collections import OrderedDict
import re
from openai import OpenAI
from config import API_KEY, BASE_URL, MODEL, TEMPERATURE, USER_FILE, SYSTEM_FILE, ERROR_LOG_PATH, ROOT
from config import MODEL_SUMMARY, TEMPERATURE_SUMMARY, USER_FILE_SUMMARY, SYSTEM_FILE_SUMMARY
from config import MODEL_CHAT, TEMPERATURE_CHAT, USER_FILE_CHAT, SYSTEM_FILE_CHAT
import itertools
import os

app = Flask(__name__)
port = 9000 # Default nlpserver port
language = 'en_core_web_lg'  
nlp = spacy.load(language)
# Cache for dynamically loaded pipelines
NLP_CACHE = {}
# json_file = json.load(open('webserver/data/data.json', 'r', encoding='utf-8'))   # sollte angepasst werden, sodass es mit relativen pfaden vom Skript arbeitet. Bisher klappt das nur beim Aufruf "python nlpserver/server.py" vom Hauptordner
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
debug = True

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


def build_prompt(sys_file, us_file, sents: str | None = None):
    system_prompt = open(sys_file, 'r', encoding='utf-8').read().strip()
    user_prompt = open(us_file, 'r', encoding='utf-8').read().strip()

    if sents is not None:
        # Falls in der User-Prompt-Datei ein Platzhalter steht, ersetzen
        if "[TEXT]" in user_prompt:
            user_prompt = user_prompt.replace("[TEXT]", sents)
        else:
            # sonst Text einfach anhängen
            user_prompt = f"{user_prompt}\n\n{sents}"

    return [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt}
    ]

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


#prompt for relation extraction via openai 
def get_relation(sent: str):
    prompt = build_prompt(SYSTEM_FILE, USER_FILE, sent)
    response = client.chat.completions.create(
        model=MODEL,
        messages=prompt,
        temperature=TEMPERATURE,
        seed=42
    )

    relations = response.choices[0].message.content
    
    return relations

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


def map_ner_tag(tag: str) -> str:
    match(tag):
        case 'PERSON':
            return 'PER'
        case 'LOCATION':
            return 'LOC'
        case 'GPE':
            return 'LOC'
        case 'NORP':
            return 'ORG'
        case 'ORGANISATION' | 'ORGANIZATION' | 'ORG':
            return 'ORG'
        case 'LOC':
            return 'LOC'
    # Default bucket for other entity classes (keep conservative)
    return 'ORG'


def _normalize_entity_text2(text: str) -> str:
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


def _normalize_entity_text(text: str) -> str:
    """Normalize entity surface form for stable keys.
    - trim whitespace
    - strip leading/trailing punctuation
    - collapse multiple spaces
    """
    if not text:
        return ''
    t = text.strip()
    # strip quotes/brackets and trailing punctuation
    t = re.sub(r"^[\s'\"“”‘’„‚()\[\]{}/\\]+", '', t)
    t = re.sub(r"[\s'\"“”‘’„‚()\[\]{}/\\.,;:!?•·–—-]+$", '', t)
    # collapse internal whitespace
    t = re.sub(r"\s+", ' ', t)
    return t.strip()


def _is_valid_entity(text: str, tag: str) -> bool:
    """Lightweight quality filter to reduce junk entities.
    Keep short but non-empty alphabetic tokens; drop URLs and symbol-only strings.
    """
    if not text:
        return False
    if len(text) < 2:
        return False
    if re.search(r"https?://", text, re.IGNORECASE):
        return False
    # Must contain at least one letter (avoid pure numbers/symbols)
    if not re.search(r"[A-Za-zÄÖÜäöüß]", text):
        return False
    # Limit very long multiword mentions
    if len(text.split()) > 8:
        return False
    return True


def _ensure_sentencizer(nlp_pipe):
    try:
        if 'parser' not in nlp_pipe.pipe_names and 'senter' not in nlp_pipe.pipe_names:
            nlp_pipe.add_pipe('sentencizer')
    except Exception:
        pass


def _load_spacy_model(candidates):
    for name in candidates:
        try:
            if name in NLP_CACHE:
                return NLP_CACHE[name]
            pipe = spacy.load(name)
            _ensure_sentencizer(pipe)
            NLP_CACHE[name] = pipe
            return pipe
        except Exception:
            continue
    return None


def _detect_language(text: str) -> str:
    # Try langdetect if available, else heuristic
    try:
        from langdetect import detect as _ldetect  # type: ignore
        code = _ldetect(text)
        if code.startswith('de'):
            return 'de'
        if code.startswith('en'):
            return 'en'
    except Exception:
        pass

    # Heuristic: diacritics and stopwords
    lower = text.lower()
    if re.search(r"[äöüß]", lower):
        return 'de'
    de_sw = {'und', 'die', 'der', 'das', 'ist', 'nicht', 'für', 'mit', 'im', 'dem', 'den', 'ein', 'eine', 'zu', 'auf'}
    en_sw = {'the', 'and', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'on', 'a', 'an'}
    tokens = re.findall(r"\b\w+\b", lower)
    if not tokens:
        return 'en'
    de_count = sum(1 for t in tokens if t in de_sw)
    en_count = sum(1 for t in tokens if t in en_sw)
    if de_count > en_count:
        return 'de'
    return 'en'


def _get_nlp_for_text(text: str):
    lang = _detect_language(text)
    if lang == 'de':
        pipe = _load_spacy_model(['de_core_news_lg', 'de_core_news_md', 'de_core_news_sm'])
        if pipe:
            return pipe
    else:
        pipe = _load_spacy_model(['en_core_web_lg', 'en_core_web_md', 'en_core_web_sm'])
        if pipe:
            return pipe
    # Fallback multilingual recognizer
    pipe = _load_spacy_model(['xx_ent_wiki_sm'])
    if pipe:
        return pipe
    # Last resort: default preloaded nlp
    _ensure_sentencizer(nlp)
    return nlp

@app.route('/', methods=['POST'])
def process_request():
    try:
        #perform named entity recognition
        data = ' '.join(request.data.decode('utf-8').split())
        if data == '':
            return jsonify({
                'sentences': [],
                'entities': {},
                'relations': {}
            }), 200
        #debug = request.debug
        nlp_pipe = _get_nlp_for_text(data)
        doc = nlp_pipe(data)
        sentences = []
        entities = OrderedDict()
        formatted_input = OrderedDict()
        relations = OrderedDict()
        for sent_idx, sent in enumerate(doc.sents):
            ents = []  # accepted spaCy spans (kept for token tagging)
            ent_names_for_sentence = []  # canonical names aligned to ents order
            for ent in sent.ents:
                raw_label = ent.label_
                # accept a conservative set of raw labels; include NORP mapped to ORG
                if raw_label not in {"PERSON", "ORG", "GPE", "LOC", "NORP"}:
                    continue
                tag = map_ner_tag(raw_label)
                norm = _normalize_entity_text2(ent.text)
                if not _is_valid_entity2(norm, tag):
                    continue

                ents.append(ent)
                ent_names_for_sentence.append(norm)

                if norm not in entities:
                    tokens_count = len(norm.split())
                    entities[norm] = {
                        'type': tag,
                        'value': norm.split()[0],
                        'tokens': tokens_count,
                        'multiword': None if tokens_count < 2 else norm,
                        'caption': ent.text,
                        'count': 1,
                        'sent_idx': [sent_idx]
                    }
                else:
                    entities[norm]['count'] += 1
                    entities[norm]['sent_idx'].append(sent_idx)
            sentence = sent.text.strip()
            if len(ents) > 1:
                formatted_input[f'sentence{sent_idx}'] = {
                    'text': sentence,
                    'entities': ent_names_for_sentence
                }
            tokens = []
            for token_idx, token in enumerate(sent):    
                ner_tag = 'O'
                for ent in ents:
                    if token.idx >= ent.start_char and token.idx < ent.end_char:
                        ner_tag = map_ner_tag(ent.label_)
                        break
                tokens.append({
                    'index': token_idx + 1,
                    'word': token.text,
                    'originalText': token.text,
                    'ner': ner_tag
                })      
            sentences.append({
                'index': sent_idx,
                'parse': 'SENTENCE_SKIPPED_OR_UNPARSABLE',
                'tokens': tokens,
                'text': sentence
            })
    
        if not len(formatted_input) == 0:
            model_input = json.dumps(formatted_input, indent=2, ensure_ascii=False)
            relations = get_relation(model_input)
            if debug:
                dump_entities_answer_prompt(entities, relations, model_input)
            relations = extract_relations(relations, formatted_input)

        response = {
            'sentences': sentences,
            'entities': entities,
            'relations': relations
        }
        return jsonify(response), 200
    except Exception as e:
        print(str(e))
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/summarize', methods=['POST'])
def summarize():
    try:
        data = request.get_json()
        text = data.get("text", "")

        if not text.strip():
            return jsonify({"summary": "No text provided for summarization."}), 400

        prompt = build_prompt(SYSTEM_FILE_SUMMARY, USER_FILE_SUMMARY, text)

        print(prompt)

        response = client.chat.completions.create(
            model=MODEL_SUMMARY,
            messages=prompt,
            temperature=TEMPERATURE_SUMMARY,
        )

        summary = response.choices[0].message.content.strip()

        print("[NLP] Summary generated:")
        print(summary)

        return jsonify({
            "summary": summary
        })

    except Exception as e:
        print("[NLP] Error in /summarize:", str(e))
        return jsonify({"error": str(e)}), 500


@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json() or {}
        question = (data.get("question") or "").strip()
        context  = (data.get("context")  or "").strip()
        history  = data.get("messages")  # expected: [{'role':'user'|'assistant', 'content':'...'}, ...]

        # Minimal validation: we need at least a question, and either context or history.
        if not question and not (isinstance(history, list) and len(history) > 0):
            return jsonify({"error": "Missing 'question'."}), 400

        messages = None

        if isinstance(history, list) and len(history) > 0:
            # History path WITH context + question awareness
            messages = build_messages_with_files(
                SYSTEM_FILE_CHAT,
                USER_FILE_CHAT,
                history_messages=history,
                context=context or "",
                question=question or ""
            )
        else:
            # Fallback: classic QA
            if not context:
                return jsonify({"error": "Missing 'context'."}), 400
            messages = build_chat_prompt(SYSTEM_FILE_CHAT, USER_FILE_CHAT, question, context)


        response = client.chat.completions.create(
            model=MODEL_CHAT,
            messages=messages,
            temperature=TEMPERATURE_CHAT
        )

        answer = (response.choices[0].message.content or "").strip()
        return jsonify({"answer": answer}), 200

    except Exception as e:
        print("[NLP] Error in /chat:", str(e))
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=port)

