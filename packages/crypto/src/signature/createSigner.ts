/*
 * Copyright 2020 - Transmute Industries Inc.
 *
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

import { Secp256k1KeyPair } from '@transmute/did-key-secp256k1';
import { Ed25519KeyPair } from '@transmute/did-key-ed25519';

export const createSigner = async (privateKeyJwk: any) => {
  let key: any;

  switch (privateKeyJwk.crv) {
    case 'Ed25519': {
      key = await Ed25519KeyPair.from({
        publicKeyJwk: privateKeyJwk,
        privateKeyJwk,
      });
      break;
    }
    case 'secp256k1': {
      key = await Secp256k1KeyPair.from({
        publicKeyJwk: privateKeyJwk,
        privateKeyJwk,
      });
      break;
    }
  }

  if (!key) {
    throw new Error('Unsupported crv ' + privateKeyJwk.crv);
  }

  const signer = key.signer();

  return {
    sign: (data: Buffer) => {
      return signer.sign({ data });
    },
  };
};
