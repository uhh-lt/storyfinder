import { createStore, applyMiddleware, compose } from 'redux';
import rootReducer from '../reducers';
import { combineReducers } from 'redux';  
import * as reducers from '../reducers';
import thunkMiddleware from 'redux-thunk';

const reducer = combineReducers(reducers); 

const enhancer = compose(
	applyMiddleware(thunkMiddleware)
  // Middleware you want to use in development:
 // applyMiddleware(d1, d2, d3),
  // Required! Enable Redux DevTools with the monitors you chose
);

export default function configureStore(initialState) {
  // Note: only Redux >= 3.1.0 supports passing enhancer as third argument.
  // See https://github.com/rackt/redux/releases/tag/v3.1.0
  const store = createStore(reducer, initialState, enhancer);
  return store;
}