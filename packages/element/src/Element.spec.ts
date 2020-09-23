import Element from './Element';
import { EthereumLedger } from '@sidetree/ethereum';
import { testVectors } from '@sidetree/test-vectors';
import { resetDatabase, getTestLedger } from './test/utils';
import config from './test/element-config.json';

console.info = () => null;

describe('Element', () => {
  let ledger: EthereumLedger;
  let element: Element;

  beforeAll(async () => {
    await resetDatabase();
    ledger = await getTestLedger();
  });

  afterAll(async () => {
    await element.close();
  });

  it('should create the element class', async () => {
    element = new Element(config, config.versions, ledger);
    expect(element).toBeDefined();
  });

  it('should initialize the element class', async () => {
    await element.initialize(false, false);
  });

  it('should get versions', async () => {
    const response = await element.handleGetVersionRequest();
    expect(response.status).toBe('succeeded');
    const versions = JSON.parse(response.body);
    expect(versions).toHaveLength(3);
    expect(versions[0].name).toBe('core');
    expect(versions[1].name).toBe('ethereum');
    expect(versions[2].name).toBe('ipfs-with-cache');
    expect(versions[0].version).toBeDefined();
    expect(versions[1].version).toBeDefined();
    expect(versions[2].version).toBeDefined();
  });

  it('should handle operation request', async () => {
    const operation = await element.handleOperationRequest(
      Buffer.from(JSON.stringify(testVectors.create.createRequest))
    );
    expect(operation.status).toBe('succeeded');
    expect(operation.body).toBeDefined();
  });

  it('should resolve a did after Observer has picked up the transaction', async () => {
    await element.triggerBatchAndObserve();
    const did = 'did:elem:EiBFsUlzmZ3zJtSFeQKwJNtngjmB51ehMWWDuptf9b4Bag';
    const operation = await element.handleResolveRequest(did);
    expect(operation.status).toBe('succeeded');
    expect(operation.body.didDocument.id).toEqual(did);
  });
});
