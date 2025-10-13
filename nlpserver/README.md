# NLP Server module 

# General Overview
The NLP Server is the module for the plugin that performs most of the relevant core functions like named entity recognition, relation extraction and summarization. 

# NLP server
- `server.py`: All components are put into a Flask web API for the plugin to call 
    - loafs config from config.py 
    - port 9000 
    - API endpoints: 
        - POST/ -> main NER and relationship pipeline 
        - POST/ summarize -> text summarization

# NER and Relation extraction 
Named entity recognition (NER) and relation extraction are both key functions of the nlp server. 
- `ner_pipeline`: pipeline using spaCy and API Call to an LLM via OpenAI client
    - Responses in json format (sentence, entities and relationship)

# Data 
The data folder contains all relevant prompts that are used for the summary generation as well as the named entity recognition and relation extraction. In general, the website text gets passed alongside these further prompts in order to receive the nlp answer.
- `system_prompt_summary.txt`: Contains the system prompt for the summary feature 
- `user_prompt_summary.txt`: Contains the user prompt for the summary generation
- `system_prompt_chat.txt`: Contains the system prompt for the chat feature
- `user_prompt_chat.txt`: Contains the user prompt for the chat feature
- `system_prompt.txt`: Contains the system prompt for the named entity recognition 
- `user_prompt.txt`: Contains the user prompt for the named entity recognition

# Configurations
- `config.py:` Central configuration of the nlpserver that 
    - Loads the environment variables from the .env file 
    - Stores model configuration for the summary and NER functions 
    - Provides file locations for the prompt .txt 
    - Set key parameters 

# Helpers and other assets 
- `dependencies.sh`: Contains python dependencies and checks and installs spacey models to prevent runtime errors
- `env`: Contains the API Key and Base URL (which will not be pushed in git since it is included in the .gitignore file)
- `requirements.txt`: Contains packages that need to be installed for the NLP server to function properly (flask, spacy)

# Dockerization 
- `Dockerfile`: Containerizes the NLP server so that it can run on every environment 
