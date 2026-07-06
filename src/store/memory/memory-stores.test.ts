import { runStoresContract } from '../stores-contract';
import { createMemoryStores } from './memory-stores';

runStoresContract('memory', createMemoryStores);
