import os
from pathlib import Path
from dotenv import load_dotenv

# Root-Verzeichnis des Projekts relativ zu dieser Datei
ROOT = Path(__file__).resolve().parent

load_dotenv(dotenv_path=f'{ROOT}/Data/.env')

# API-Konfiguration
API_KEY = os.getenv('API_KEY')
BASE_URL = os.getenv('API_BASE_URL')
MODEL_REL = os.getenv('MODEL', 'gpt-oss-120b')#deepseek-r1-distill-llama-70b')
TEMPERATURE = 0.0

USER_FILE_RELATIONS = f'{ROOT}/Data/user_prompt_relations.txt'
SYSTEM_FILE_RELATIONS = f'{ROOT}/Data/system_prompt_relations.txt'

'''
RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "RelationsResponse",
        "schema": {
            "type": "object",
            "description": "A mapping of sentence identifiers to extracted relations.",
            "additionalProperties": {
"type": "object",
"required": ["relations"],
"additionalProperties": False,
"properties": {
    "relations": {
    "type": "array",
    "description": "List of detected relations for the sentence.",
    "items": {
        "type": "string",
        "pattern": "^\\d+\\([^()]*\\)\\d+$",
        "description": "A relation in the format index(relation)index, e.g. 0(was born in)1"
    }
    }
}
}
}
'''