import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Root-Verzeichnis des Projekts relativ zu dieser Datei
ROOT = Path(__file__).resolve().parent

# API-Konfiguration
API_KEY = os.getenv('API_KEY')
BASE_URL = os.getenv('API_BASE_URL')
MODEL_REL = os.getenv('MODEL', 'deepseek-r1-distill-llama-70b')
TEMPERATURE = 0.0

USER_FILE = f'{ROOT}/data/user_prompt.txt'
SYSTEM_FILE = f'{ROOT}/data/system_prompt.txt'
ERROR_LOG_PATH = f'{ROOT}/data/error_logs/'

TEMPERATURE_SUMMARY = 0.5
MODEL_SUMMARY = ("internvl2.5-8b")
USER_FILE_SUMMARY = f'{ROOT}/data/user_prompt_summary.txt'
SYSTEM_FILE_SUMMARY = f'{ROOT}/data/system_prompt_summary.txt'

TEMPERATURE_CHAT = 0.5 
MODEL_CHAT = ("gpt-oss-120b")
USER_FILE_CHAT = f'{ROOT}/data/user_prompt_chat.txt' # existiert noch nicht
SYSTEM_FILE_CHAT = f'{ROOT}/data/system_prompt_chat.txt' # existiert noch nicht
