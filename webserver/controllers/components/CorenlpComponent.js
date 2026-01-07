var request = require('request')
	, _ = require('lodash')
	, async = require('async') 
	;
var fs = require('fs');
const { exit } = require('process');
const fetch = require('node-fetch')

const PREPROCESS_URL = process.env.PREPROCESS_URL || "http://localhost:9000/preprocess";
const NER_URL = process.env.NER_URL || "http://localhost:9001/ner";
const RELATIONS_URL = process.env.RELATIONS_URL || "http://localhost:9002/relations";


async function postJson(url, body)
{
	const res = await fetch(url, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});

	if(!res.ok)
	{
		const text = await res.text();
		throw new Error(`Request to ${url} failed: ${res.status} ${text}`)
	}
	return res.json()
}
	
module.exports = function(){	
	async function parse(data){

		var callback = arguments[arguments.length - 1];

		try {
			//Perform Preprocessing of text
			const preprocessedText = await postJson(PREPROCESS_URL, {text: data});
			const {cleaned_text, language } = preprocessedText;

			//Perform Named Entity Recognition
			const {sentences, entities, formated_input} = await postJson(NER_URL, {text: cleaned_text, language: language});
			//Perform Relation Extraction
			const { relations } = await postJson(RELATIONS_URL, { formated_input: formated_input })

			data = {
				sentences: sentences,
				entities: entities,
				relations: relations
			}
			dump_to_disk(data)
			setImmediate(() => callback(null, data));
		} catch (error)
		{
			console.error('Error in parsing website from corenlp component', error.message)
			setImmediate(() => callback(new Error()));
		}
	}
		
	this.parse = parse;

	function dump_to_disk(data)
	{
		fs.writeFileSync('server_output.json', JSON.stringify(data, null, 4));
	}
};