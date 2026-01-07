from fastapi import FastAPI
from typing import Dict
import json
import asyncio
import re
import itertools
from openai import AsyncOpenAI, DefaultAioHttpClient, APIConnectionError, RateLimitError
#from httpx import AsyncClient, Timeout, Limits
from pydantic import BaseModel
from config import (
    SYSTEM_FILE_RELATIONS, USER_FILE_RELATIONS, MODEL_REL, TEMPERATURE, API_KEY, BASE_URL
)

app = FastAPI()

client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL, http_client=DefaultAioHttpClient())

class Request(BaseModel):
    formated_input: Dict


class Response(BaseModel):
    relations: Dict


def extract_relations(relations: Dict, entities: Dict):
    output = {}
    try:
        for key, value in relations.items():
                
            sent_idx = int(key.replace('sentence', ''))
            relation = value.get('relations', None)
            ents = entities.get(key, {}).get('entities', [])

            
            for rel in relation:
                rel = rel.strip()
                match = re.match(r'(\d+)(\([\s\S]+\))(\d+)', rel)
                if not match:
                    continue
                #ToDo: Write failsafe, if model generated indices, which are not present in entities dict
                index1, relation_label, index3 = int(match.group(1)), match.group(2).strip('()'), int(match.group(3))
                
                if index1 >= len(ents) or index3 >= len(ents):
                    continue
                if index1 >= index3:
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
        print(f'Unexpected error in extract_relations: {e}')
       
    return output



def batch_items(items, batch_size=32):
    for i in range(0, len(items), batch_size):
        yield dict(list(items.items())[i:i+batch_size])


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

async def get_relation(sent: str):
    prompt = build_prompt(SYSTEM_FILE_RELATIONS, USER_FILE_RELATIONS, sent)
    try:
        response = await client.chat.completions.create(
            model=MODEL_REL,
            messages=prompt,
            temperature=TEMPERATURE,
            #seed=42,
        )
        return response
    except Exception as e:
        print(f'Error during get_relation API call: {e}')
        raise

async def process_batch(batch, max_retries=4):
    model_input = json.dumps(batch, indent=2, ensure_ascii=False)

    for attempt in range(max_retries):
        try:
            response = await get_relation(model_input)
            return response
        
        except (RateLimitError, APIConnectionError) as e:
            print(f'API call failed on attempt {attempt + 1}/{max_retries}: {e}')
            await asyncio.sleep(0.5 * 2 ** attempt)

    raise Exception('OpenAI API call failed after retries')

def merge_results(batch_responses):
    merged = {}
    pattern = r'\{[\s\S]*\}'

    for r in batch_responses:
        content = r.choices[0].message.content
        content = re.findall(pattern, content, re.DOTALL)
        content = json.loads(content[-1])
        merged.update(content)
        
    return merged

@app.post('/relations', response_model=Response)
async def relations(request: Request):
    formated_input = request.formated_input
    if len(formated_input) == 0:
        return Response(relations={})
    
    batches = list(batch_items(formated_input))
    tasks = [process_batch(batch) for batch in batches]
    responses = await asyncio.gather(*tasks)
    merged = merge_results(responses)
    relations = extract_relations(merged, formated_input)

    return Response(relations=relations)

