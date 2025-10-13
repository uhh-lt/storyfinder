# StoryFinder v2

**StoryFinder** is a browser plugin for the automatic detection, analysis, and visualization of relevant information (people, places, organizations) on websites. 

This project is being developed as part of the master's project course 'Web Interfaces for Language Processing Systems - SS25 (64-869 P/S)' at the University of Hamburg (UHH). It is a continuation and further development of the original [StoryFinder prototype](https://uhh-lt.github.io/storyfinder/), originally created at the University of Hamburg (UHH) in 2017/2018.

The overall scope of the updated version contains several modernizations and implementation of new features in order to make the tool more user friendly and robust against future technology advancements. Another addition is the architectural change into microservices, capsuling components into their own docker containers to ensure future additions can be added more easily. 

## Goal
The extension analyzes website content, extracts named entities, and visualizes their relationships. These relationships are shown in a manually enhacable graph visualization. Additionally, a new summary feature was included alongside a chat function that shall help users to grasp the contents of articles quickly and assist with their questions. 

## Overall Tool Features
- Parsing and saving website content
- Named Entity Recognition (NER) via LLM
- Linking entities across websites (Entity Relationships)
- Visualization of entities and relations as a graph
- Browsing history of visited websites
- Creating summaries of pages 
- Highlighting entities on webpages 
- Answering questions regarding websites via a chat function

## Project Structure

This ReadMe file is a brief summary of the key features of the tool. In addition most big components include their own ReadMe file with further explanations of the components structure. Notes on installement can be found in the docs/ file alongside further informations about the project scope and other pieces of documentation. 

- `.vscode/`:  VScode configuration to run and debug the project
- `docs/`: Planning, documentation, concepts
- `nplserver/`: NLP Server module - look at ReadMe in file
- `plugin/`: Chrome plugin code - look at ReadMe in file
- `webserver/`: Webserver module - look at ReadMe in file

## Links to further ReadMe files 

Please refer to our other readme files for further information:
- [Webserver Readme](webserver/README.md)
- [Plugin Readme](plugin/README.md)
- [NLP server Readme](nlpserver/README.md)
