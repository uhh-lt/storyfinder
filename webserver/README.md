# Webserver 

In general our webserver is structures in a model view control pattern which is the basis of the file structures. The following gives an overview of webserver files as an overview of the existing components. Further information on the utils and views file in /public can be found in a dedicated [readme](public/README.md). 

## Server entrypoint
- `server.js`: Main entrypoint that coordinates the backend logic, database, authentication and UI
    - Server setup (port 3055)
    - Database initalization (my sql via schama.sql)
    - Chrome extension integration
    - Middleware (body-parser, cookie session, method-override)
    - Loads the views to handle the layout
    - Loads all controllers 

## Building and Running the Server
- `package.json`: Instruction on installation, building and running the server. Contains all required Node.js dependencies 

## Datasources
Data file in the webserver that contains all relevant contents for the manual NER and relationship extraction. As well as article identification.
- `data/sql/schema.sql`: Definition of MySQL database tables (Articles & sites, Entities, Collections, Users, Logs, Visits)
- `data/stopwords/german.txt`: List of German stopwords that are used for preprocessing
- `trees.txt`: decision tree that classifies texts if it is a main article or not

## Controllers
Orchestration of models and components
- components 
    - `CorenlpComponents.js`: Bridge between CoreNLP server and the plugin. Cleaning of JSON output
    - `GermanerCOmponents.js`: Wrapper for Germaner server
    - `KeywordComponents.js`: Calculation of keywords from candidate n-grams basey on frequency. Returns the most relevant keywords for a document
    - `RandomforestComponent.js`: Random Forest classifier implementation in Node.js (based on the decision tree in data)
    - `StopwordComponent.js`: Based on stopword list, checks if token is a stopword
- `ArticlesController.js`: Definition of express routes for article viewing and uploading image (View article GET/Articles/.articleId, Upload article image PUT (Acticles/:articleId/image))
- `ChatController`: implements the REST API and manages chat sessions, user messages, and LLM replies
- `EntitiesController.js`: Manages endpoints to search, fetch, add, merge and delete entities within a user's collection 
- `GraphsController.js`: Builds graph structures that users (based on collection, site and group of sites)
- `RelationsController.js`: Retrival and creation of entty-entity relations, user relation input 
- `SitesController.js`: Sites and parsing pipeline (listing sites in collection, adding new sites, uploading site images, extracting entities)
- `SummarizeController.js`: Controler that forwards text to an NLP server for summarization
- `UsersController.js:` User registration, login, logout and authentication status

## Datasources
- `datasources/mysql.js`: Custom query builder and helper layer for MySQL. 
    - Condition building 
    - Date helper 
    - Changelog tracking

## Models 
- `acticles.js`: Data model for articles (fetching, searching, adding and couting articles)
- `ArtictleEntity.js`: Model that manages the relationship between articles and entities (entity count, ...)
- `ChatModel.js`: Abstraction layer for chat related data (sessions, messages)
- `collection.js`: Model for user collections, retrives a users collection and creates a default one
- `entity.js`: Model for entities (counts, TF-IDF, merging, creating new intities)
- `EntitySentence.js`: Model for relationship between entities and sentences (which sentence contains which entities)
- `Ngram.js`: Ngram handling for the sytem for normalization and filtering of the n-grams and retreive the document counts for specific n-grams
- `Relation.js`: Model for the relationships between entities (type, metadata, ...)
- `RelationSentence.js`: Model for sentences and relations
- `Relationtype.js`: Relation types as labels 
- `Sentence.js`: Sentence-level operations (retriving sentences, highlighting entities, inserting new sentences into database)
- `Site.js`: Management of sites for database
- `SummaryModel.js` Model for summary operations (fetch cached summary, save summary, recover text, update summary)
- `User.js`: User Management (creation, checking for existing, verification of credentials, fetching user by ID)

## Libs
Utility functions and modules. 
- `libs/changelog.js`: Helper function to perform safe SQL updates with automatic changelog tracking for UPDATE queries
- `libs/corenlp.js`: Wrapper for the Stanford CoreNLP server -> Node JS sends the text to coreNLP which runs on port 9000
- `libs/evallog.js`: Logging of events 
- `libs/globalgraph.js`: Generation of the global graph of entities for a given user based on pagerank library, returns a JSON object with nodes and links
- `libs/handle_visit.js`: Pipeline for processing a  website visit (analysis and storage of webpage content)
- `libs/nodes.js`: REST API for managing entities and the relationships 
- `libs/relations.js`: Manage relationships between relationships (edges) and entities (nodes) in the graph. Fetching, creating and updating
- `libs/tokenizer.js`: Module that splits text into words 

## Frontend (Public)
Contents of the public file include the frontend files. The following is an overview of the content of public/graph which include the graph visualisation which is preprocessed in the webserver. Everything else can be found in the dedicated [readme](public/README.md). 
- css
    - `css/bootstap.css`: Standard Bootstrap 3.3.6 framework
    - `css/awesome_fonts.css`: FontAwesome for scalable vector icons
    - `css/font-awesome.min`: FontAwesome in a compact format
    - `css/svg.css`: Styling for SVG elements
- fonts: used fonts for the graph
- js files:
    - `js/actions/StoryfnderActions.js`: Definition of actions for managing the states in the Storyfinder with the interaction in REST APIs
    - `js/constants/actionTypes.js`: List of action types 
    - `js/libs`: External JS libraries
        - cola.js
        - d3.min.js
        - loadash.js
        - pagerank.js
        - shortestpaths.js
    - `reducers`: Redux reducers to update the states and responses for state management
    - `register/register.js`: Frontend form handler for user login and registration
- html layouts 
    - `_index.html`: main frontend page of the graph
    - `login.html:` User login page for the storyfnder
    - `register.html`: User registration page for the storyfinder
- templates: To dynamically render different items in the frontend
    - graph
    - nodes
    - relations
    - search
    - sites
- vis folder 
    - `helpers/smoothLine.js`: module to generate smooth line path between nodes in the graph visualization
    - transitions: Modules for updating the graph visualization with new or changed data 
        - `applyNewData.js`
        - `moveExisting.js`
        - `removeDeleted.js`
        - `showNew.js`
- `app.js`: Main JS entry point 
- `global_graph.js`: Creates a structured, consistend graph model that gets used
- `index.js`: Run file
- `package.json`: Metadata and config for the Node.js 
- `register.js:` Compiled Java scrip file by browserify
- `search.js`: Search fearure in the UI 
- `storyfinder.js`: Redux action and state manager 
- `vis.js`: Visualization, layout and animated updates

## Dockerfiles
Dockerization of the webserver that it can be run and used on different device types. 
- `docker-deploy.sh`: Script that automates building and publishing a Docker image for the project (building the docker image and uploading it to the docker hub)
- `Dockerfile`: Setup for the webserver part of the Storyfinder in a Node.js container

## Helpers and Assets
- `setenv.sh`: Configuration of secrets, DB connestions, NLP Services and Plugin IDs
- `init_dev.sh`: Script that sets up the development environment for the webserver (libraries and Node dependencies)
- `utils/logger.js`: central logging unit for the node.js server (format, storage, etc.)v
- `sever_output.json:` Sample output file containing the return format of the NLP server

- LISENSE: Standard Apache License 2.0, legal terms on project usage
- Views: Handlebars templates
    - `Articles/get.handlebars`: View for the user to see the cached article content (including metadata, site info and screenshots)
    - `layouts/main.handlebars`: Layout wrapper for the views into a HTML format
- `env.example`: Example file of an .env for the project setup

