#!/bin/bash

pip install --no-cache-dir -r requirements.txt

python -m spacy validate | grep -q "de_core_news_lg" || python -m spacy download de_core_news_sm
python -m spacy validate | grep -q "en_core_web_lg" || python -m spacy download en_core_web_lg
