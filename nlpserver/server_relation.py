from flask import Flask, request, jsonify
from collections import OrderedDict
import json
from common import (
    _get_nlp_for_text, map_ner_tag, _normalize_entity_text2, _is_valid_entity2, 
    get_relation, extract_relations, debug, dump_entities_answer_prompt
)

app = Flask(__name__)

@app.route('/relation', methods=['POST'])
def relation():
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
    
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True}), 200
    

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=9001)