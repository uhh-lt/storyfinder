import Immutable from 'immutable';
import * as types from '../constants/ActionTypes';

const initialState = Immutable.Map({
	currentSite: null,
	focusedNode: null,
	selectedNode: null,
	isFetching: false,
	state: 'graph',
	graph: null
	/*groups: Immutable.Map({
		0: Immutable.Map({
				name: 'No Group',
				children: Immutable.List([])
		})
	})*/
});

/*function receiveLayers(state, path, layers){
	var parentId = path.last();

	var layerIds = new Immutable.List();
	layers.forEach((layer) => {
		layerIds = layerIds.push(layer.id);
		state = state.setIn(['layers', layer.id], new Immutable.fromJS(layer));
	});
	
	state = state.set('isFetching', false);
	if(path.size == 1){
		state = state.setIn(['groups', parentId, 'children'], layerIds);
	}else{
		state = state.setIn(['layers', parentId, 'children'], layerIds);
	}

	return state;
}*/

function toRelation(state, entity1_id, entity2_id){
	state = state.set('state', state.get('state') + '-to-relation');
	state = state.set('entity1_id', entity1_id);
	state = state.set('entity2_id', entity2_id);
	return state;
}

function showRelation(state, entity1_id, entity2_id){
	state = state.set('state', 'relation');
	state = state.set('entity1_id', entity1_id);
	state = state.set('entity2_id', entity2_id);
	return state;
}

function receiveRelation(state, data){
	state = state.set('state', 'relation');
	state = state.set('isFetching', false);
	state = state.set('relation', data);
	return state;
}

function requestRelation(state, entity1_id, entity2_id){
	state = state.set('state', 'relation');
	state = state.set('isFetching', true);
	return state;
}

function requestGlobal(state){
	state = state.set('state', 'requesting-graph');
	return state;
}

function receiveGlobal(state, graph){
	state = state.set('state', 'graph');
	/*var nodes = {};
	graph.nodes.forEach(function(node){
		nodes[node.id] = node;
	});
	graph.nodes = nodes;*/
	
	state = state.set('graph', Immutable.fromJS(graph));
	return state;
}

function toGraph(state){
	state = state.set('state', state.get('state') + '-to-graph');
	return state;
}

function showGraph(state){
	state = state.set('state', 'graph');
	return state;
}

function toLocalgraph(state, site_id){
	state = state.set('state', state.get('state') + '-to-localgraph');
	state = state.set('site_id', site_id);
	state = state.set('site', null);
	state = state.set('sites', null);
	state = state.set('site_ids', null);
	state = state.set('articles', null);
	state = state.set('groupsize', null);
	return state;
}

function toGroupgraph(state, sites){
	state = state.set('state', state.get('state') + '-to-groupgraph');
	state = state.set('site_ids', Immutable.fromJS(sites));
	state = state.set('site_id', null);
	state = state.set('article', null);
	state = state.set('site', null);
	return state;
}

function showLocalgraph(state, site, article){
	state = state.set('state', 'localgraph');
	state = state.set('site', Immutable.fromJS(site));
	state = state.set('article', Immutable.fromJS(article));
	return state;
}

function showGroupgraph(state, sites, articles){
	state = state.set('state', 'groupgraph');
	state = state.set('sites', Immutable.fromJS(sites));
	state = state.set('articles', Immutable.fromJS(articles));
	state = state.set('groupsize', state.get('site_ids').toJSON().length);
	return state;
}

function toGlobal(state){
	state = state.set('state', state.get('state') + '-to-global');
	state = state.set('site_id', null);
	state = state.set('site_ids', null);
	state = state.set('site', null);
	state = state.set('article', null);
	state = state.set('sites', null);
	state = state.set('articles', null);
	state = state.set('groupsize', null);
	state = state.set('sites', null);
	return state;
}

function showGlobal(state){
	state = state.set('state', 'graph');
	return state;
}

function requestNeighbours(state, nodeId){
	state = state.set('state', 'request-neighbours');
	return state;
}

function receiveNeighbours(state, nodeId, neighbours){
	state = state.set('state', 'graph');
	state = state.setIn(['graph', 'nodes', nodeId, 'expanded'], true);
	state = state.mergeIn(['graph', 'nodes'], neighbours.nodes);
	state = state.mergeIn(['graph', 'links'], neighbours.links);
	return state;
}

function createNode(state, data){
	state = state.set('state', 'create');
	state = state.set('nodedata', Immutable.fromJS(data));
	return state;
}

function requestSaveNode(state){
	state = state.set('state', 'request-save-node');
	return state;
}

function receiveSaveNode(state, nodeData){
	state = state.set('state', 'receive-save-node');
	state = state.set('node', Immutable.fromJS(nodeData));
	return state;
}

function requestCreateRelation(state){
	state = state.set('state', 'request-create-relation');
	return state;
}

function receiveCreateRelation(state, data){
	state = state.set('state', 'receive-create-relation');
	state = state.set('relation', Immutable.fromJS(data));
	return state;
}

export default function layerlist(state = initialState, action) {  
	switch (action.type) {
		case 'TO_RELATION':
			return toRelation(state, action.entity1_id, action.entity2_id);
		/*case 'SHOW_RELATION':
			return showRelation(state, action.entity1_id, action.entity2_id);*/
		case 'REQUEST_RELATION':
			return requestRelation(state, action.entity1_id, action.entity2_id);
		case 'RECEIVE_RELATION':
			return receiveRelation(state, action.data);
		case 'TO_GRAPH':
			return toGraph(state);
		case 'SHOW_GRAPH':
			return showGraph(state);
		case 'TO_LOCALGRAPH':
			return toLocalgraph(state, action.site_id);
		case 'TO_GROUPGRAPH':
			return toGroupgraph(state, action.sites);
		case 'SHOW_LOCALGRAPH':
			return showLocalgraph(state, action.site, action.article);
		case 'SHOW_GROUPGRAPH':
			return showGroupgraph(state, action.sites, action.articles);
		case 'TO_GLOBAL':
			return toGlobal(state);
		case 'SHOW_GLOBAL':
			return showGlobal(state);
		case 'REQUEST_GLOBAL':
			return requestGlobal(state);
		case 'RECEIVE_GLOBAL':
			return receiveGlobal(state, action.data);
		case 'REQUEST_NEIGHBOURS':
			return requestNeighbours(state, action.node);
		case 'RECEIVE_NEIGHBOURS':
			return receiveNeighbours(state, action.node, action.data);
		case 'CREATE_NODE':
			return createNode(state, action.data);
		case 'REQUEST_SAVE_NODE':
			return requestSaveNode(state);
		case 'RECEIVE_SAVE_NODE':
			return receiveSaveNode(state, action.data);
		case 'REQUEST_CREATE_RELATION':
			return requestCreateRelation(state);
		case 'RECEIVE_CREATE_RELATION':
			return receiveCreateRelation(state, action.data);
		/*case 'SELECT_SITE':
			return selectSite(state, action.siteId);
		case 'SELECT_NODE':
			return selectNode(state, action.layerId);
		case 'RECEIVE_LAYERS':
			return receiveLayers(state, action.path, action.layers);
		break;
		case 'REQUEST_LAYERS':
			return requestLayers(state, action.path);
		break;
		case 'UP_LAYER':
			return upLayer(state);*/
	}
	return state;
}