/*
 * Copyright 2020 - Transmute Industries Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { toDidDocForProfile } from './toDidDocForProfile';

import { walletSvipOperation } from '../__fixtures__';

it('can generate did doc', async () => {
  const content = await toDidDocForProfile(
    walletSvipOperation.operation[0].mnemonic,
    0,
    'elem',
    'SVIP',
    {
      service_endpoints: [
        {
          id: 'resolver-0',
          type: 'Resolver',
          endpoint: 'https://example.com',
        },
      ],
    }
  );

  expect(content).toEqual(
    walletSvipOperation.operation[0].createOperationWithPatchWalletDidDoc
  );
});
