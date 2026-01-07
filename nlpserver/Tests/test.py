import requests

website_text = '''
The Panama Papers (Spanish: Papeles de Panamá) are 11.5 million leaked documents (or 2.6 terabytes of data) published from April 3, 2016. 
The papers detail financial and attorney–client information for more than 214,488 offshore entities.[1][2][3][4][5][6] 
These documents, some dating back to the 1970s,[7] were created by, and taken from, the former Panamanian offshore law firm and corporate service provider Mossack Fonseca,[8][9] and compiled with similar leaks into a searchable database.[10]
'''


def test_preprocessing(text):
    url = 'http://localhost:9000/preprocess'
    payload = {
        'text': text
    }

    response = requests.post(url, json=payload)
    assert response.status_code == 200
    response = response.json()
    return response


def test_ner(text):
    url = 'http://localhost:9001/ner'
    payload = {
        'text': text['cleaned_text'],
        'language': text['language']
    }

    response = requests.post(url, json=payload)
    assert response.status_code == 200
    response = response.json()
    return response

def test_relations(text):
    url = 'http://localhost:9002/relations'
    payload = {
        'formated_input': text['formated_input']
    }

    response = requests.post(url, json=payload)
    assert response.status_code == 200, response.text
    response = response.json()
    return response

def test_pipeline():

    # Preprocessing
    response_preprocess = test_preprocessing(website_text)
    #print(response_preprocess)
    
    # NER
    response_ner = test_ner(response_preprocess)
    #for key, sent in response_ner['formated_input'].items():
    #    print(f'{key}:')
    #    for keyy, value in sent.items():
    #        print(f'  {keyy}: {value}')
        

    # Relations
    response_relations = test_relations(response_ner)
    print('Extracted Relations:')
    print(response_relations)



if __name__ == '__main__':
    test_pipeline()

