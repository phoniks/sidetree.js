import {
  DocumentModel,
  Encoder,
  DidState,
  ErrorCode,
  SidetreeError,
  PublicKeyPurpose,
} from '@sidetree/common';
import UpdateOperation from './UpdateOperation';

/**
 * Class that handles the composition of operations into final external-facing document.
 */
export default class DocumentComposer {
  /**
   * Transforms the given DID state into a DID Document.
   */
  public static transformToExternalDocument(
    didState: DidState,
    did: string
  ): any {
    // If the DID is deactivated.
    if (didState.nextRecoveryCommitmentHash === undefined) {
      return { status: 'deactivated' };
    }

    const document = didState.document as DocumentModel;

    // Only populate `publicKey` if general purpose exists.
    // Only populate `authentication` if auth purpose exists.
    const authentication: any[] = [];
    const publicKeys: any[] = [];
    if (Array.isArray(document.publicKeys)) {
      for (const publicKey of document.publicKeys) {
        const id = '#' + publicKey.id;
        const didDocumentPublicKey = {
          id: id,
          controller: '',
          type: publicKey.type,
          publicKeyJwk: publicKey.jwk,
        };
        const purposeSet: Set<string> = new Set(publicKey.purpose);

        if (purposeSet.has(PublicKeyPurpose.General)) {
          publicKeys.push(didDocumentPublicKey);
          if (purposeSet.has(PublicKeyPurpose.Auth)) {
            // add into authentication by reference if has auth and has general
            authentication.push(id);
          }
        } else if (purposeSet.has(PublicKeyPurpose.Auth)) {
          // add into authentication by object if has auth but no general
          authentication.push(didDocumentPublicKey);
        }
      }
    }

    // Only update `serviceEndpoints` if the array is present
    let serviceEndpoints;
    if (Array.isArray(document.serviceEndpoints)) {
      serviceEndpoints = [];
      for (const serviceEndpoint of document.serviceEndpoints) {
        const didDocumentServiceEndpoint = {
          id: '#' + serviceEndpoint.id,
          type: serviceEndpoint.type,
          serviceEndpoint: serviceEndpoint.endpoint,
        };

        serviceEndpoints.push(didDocumentServiceEndpoint);
      }
    }

    const didDocument: any = {
      id: did,
      '@context': ['https://www.w3.org/ns/did/v1', { '@base': did }],
      service: serviceEndpoints,
    };

    if (publicKeys.length !== 0) {
      didDocument.publicKey = publicKeys;
    }

    if (authentication.length !== 0) {
      didDocument.authentication = authentication;
    }

    const didResolutionResult: any = {
      '@context': 'https://www.w3.org/ns/did-resolution/v1',
      didDocument: didDocument,
      methodMetadata: {
        recoveryCommitment: didState.nextRecoveryCommitmentHash,
        updateCommitment: didState.nextUpdateCommitmentHash,
      },
    };

    return didResolutionResult;
  }

  /**
   * Applies the update operation to the given document.
   * @returns The resultant document.
   * @throws SidetreeError if invalid operation is given.
   */
  public static async applyUpdateOperation(
    operation: UpdateOperation,
    document: any
  ): Promise<any> {
    const resultantDocument = DocumentComposer.applyPatches(
      document,
      operation.delta!.patches
    );

    return resultantDocument;
  }

  /**
   * Validates the schema of the given full document.
   * @throws SidetreeError if given document patch fails validation.
   */
  private static validateDocument(document: any) {
    if (document === undefined) {
      throw new SidetreeError(ErrorCode.DocumentComposerDocumentMissing);
    }

    const allowedProperties = new Set(['publicKeys', 'serviceEndpoints']);
    for (const property in document) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerUnknownPropertyInDocument,
          `Unexpected property ${property} in document.`
        );
      }
    }

    // Verify 'publicKeys' property if it exists.
    if (Object.prototype.hasOwnProperty.call(document, 'publicKeys')) {
      DocumentComposer.validatePublicKeys(document.publicKeys);
    }

    // Verify 'serviceEndpoints' property if it exists.
    if (Object.prototype.hasOwnProperty.call(document, 'serviceEndpoints')) {
      // Verify each endpoint entry in serviceEndpoints.
      DocumentComposer.validateServiceEndpoints(document.serviceEndpoints);
    }
  }

  /**
   * Validates the schema of the given update document patch.
   * @throws SidetreeError if given document patch fails validation.
   */
  public static validateDocumentPatches(patches: any) {
    if (!Array.isArray(patches)) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerUpdateOperationDocumentPatchesNotArray
      );
    }

    for (const patch of patches) {
      DocumentComposer.validatePatch(patch);
    }
  }

  private static validatePatch(patch: any) {
    const action = patch.action;
    switch (action) {
      case 'replace':
        DocumentComposer.validateDocument(patch.document);
        break;
      case 'add-public-keys':
        DocumentComposer.validateAddPublicKeysPatch(patch);
        break;
      case 'remove-public-keys':
        DocumentComposer.validateRemovePublicKeysPatch(patch);
        break;
      case 'add-service-endpoints':
        DocumentComposer.validateAddServiceEndpointsPatch(patch);
        break;
      case 'remove-service-endpoints':
        DocumentComposer.validateRemoveServiceEndpointsPatch(patch);
        break;
      default:
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchMissingOrUnknownAction
        );
    }
  }

  private static validateAddPublicKeysPatch(patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchMissingOrUnknownProperty
      );
    }

    DocumentComposer.validatePublicKeys(patch.publicKeys);
  }

  private static validatePublicKeys(publicKeys: any) {
    if (!Array.isArray(publicKeys)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPublicKeysNotArray);
    }

    const publicKeyIdSet: Set<string> = new Set();
    for (const publicKey of publicKeys) {
      const publicKeyProperties = Object.keys(publicKey);
      // the expected fields are id, purpose, type and jwk
      if (publicKeyProperties.length !== 4) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPublicKeyMissingOrUnknownProperty
        );
      }

      if (typeof publicKey.jwk !== 'object' || Array.isArray(publicKey.jwk)) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPublicKeyJwkMissingOrIncorrectType
        );
      }

      if (typeof publicKey.type !== 'string') {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPublicKeyTypeMissingOrIncorrectType
        );
      }

      DocumentComposer.validateId(publicKey.id);

      // 'id' must be unique
      if (publicKeyIdSet.has(publicKey.id)) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPublicKeyIdDuplicated
        );
      }
      publicKeyIdSet.add(publicKey.id);

      if (!Array.isArray(publicKey.purpose) || publicKey.purpose.length === 0) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPublicKeyPurposeMissingOrUnknown
        );
      }

      if (publicKey.purpose.length > 3) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPublicKeyPurposeExceedsMaxLength
        );
      }

      const validPurposes = new Set(Object.values(PublicKeyPurpose));
      // Purpose must be one of the valid ones in KeyPurpose
      for (const purpose of publicKey.purpose) {
        if (!validPurposes.has(purpose)) {
          throw new SidetreeError(
            ErrorCode.DocumentComposerPublicKeyInvalidPurpose
          );
        }
      }
    }
  }

  private static validateRemovePublicKeysPatch(patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchMissingOrUnknownProperty
      );
    }

    if (!Array.isArray(patch.publicKeys)) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchPublicKeyIdsNotArray
      );
    }

    for (const publicKeyId of patch.publicKeys) {
      if (typeof publicKeyId !== 'string') {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchPublicKeyIdNotString
        );
      }
    }
  }

  /**
   * validate update patch for removing service endpoints
   */
  private static validateRemoveServiceEndpointsPatch(patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchMissingOrUnknownProperty
      );
    }

    if (!Array.isArray(patch.ids)) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchServiceEndpointIdsNotArray
      );
    }

    for (const id of patch.ids) {
      DocumentComposer.validateId(id);
    }
  }

  /**
   * Validates update patch for adding service endpoints.
   */
  private static validateAddServiceEndpointsPatch(patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchMissingOrUnknownProperty
      );
    }

    if (!Array.isArray(patch.serviceEndpoints)) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchServiceEndpointsNotArray
      );
    }

    DocumentComposer.validateServiceEndpoints(patch.serviceEndpoints);
  }

  /**
   * Validates and parses services endpoints
   * @param serviceEndpoints the service endpoints to validate and parse
   */
  private static validateServiceEndpoints(serviceEndpoints: any) {
    if (!Array.isArray(serviceEndpoints)) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerPatchServiceEndpointsNotArray
      );
    }

    for (const serviceEndpoint of serviceEndpoints) {
      const serviceEndpointProperties = Object.keys(serviceEndpoint);
      if (serviceEndpointProperties.length !== 3) {
        // type, id, and endpoint
        throw new SidetreeError(
          ErrorCode.DocumentComposerServiceEndpointMissingOrUnknownProperty
        );
      }

      DocumentComposer.validateId(serviceEndpoint.id);

      if (typeof serviceEndpoint.type !== 'string') {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchServiceEndpointTypeNotString
        );
      }
      if (serviceEndpoint.type.length > 30) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchServiceEndpointTypeTooLong
        );
      }
      if (typeof serviceEndpoint.endpoint !== 'string') {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointNotString
        );
      }
      if (serviceEndpoint.endpoint.length > 100) {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointTooLong
        );
      }

      try {
        // just want to validate url, no need to assign to variable, it will throw if not valid
        // tslint:disable-next-line
        new URL(serviceEndpoint.endpoint);
      } catch {
        throw new SidetreeError(
          ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointNotValidUrl
        );
      }
    }
  }

  private static validateId(id: any) {
    if (typeof id !== 'string') {
      throw new SidetreeError(
        ErrorCode.DocumentComposerIdNotString,
        `ID not string: ${JSON.stringify(id)} is of type '${typeof id}'`
      );
    }
    if (id.length > 20) {
      throw new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
    }

    if (!Encoder.isBase64UrlString(id)) {
      throw new SidetreeError(
        ErrorCode.DocumentComposerIdNotUsingBase64UrlCharacterSet
      );
    }
  }

  /**
   * Applies the given patches in order to the given document.
   * NOTE: Assumes no schema validation is needed, since validation should've already occurred at the time of the operation being parsed.
   * @returns The resultant document.
   */
  public static applyPatches(document: any, patches: any[]): any {
    // Loop through and apply all patches.
    let resultantDocument = document;
    for (const patch of patches) {
      resultantDocument = DocumentComposer.applyPatchToDidDocument(
        resultantDocument,
        patch
      );
    }

    return resultantDocument;
  }

  /**
   * Applies the given patch to the given DID Document.
   */
  private static applyPatchToDidDocument(
    document: DocumentModel,
    patch: any
  ): any {
    if (patch.action === 'replace') {
      return patch.document;
    } else if (patch.action === 'add-public-keys') {
      return DocumentComposer.addPublicKeys(document, patch);
    } else if (patch.action === 'remove-public-keys') {
      return DocumentComposer.removePublicKeys(document, patch);
    } else if (patch.action === 'add-service-endpoints') {
      return DocumentComposer.addServiceEndpoints(document, patch);
    } else if (patch.action === 'remove-service-endpoints') {
      return DocumentComposer.removeServiceEndpoints(document, patch);
    }
  }

  /**
   * Adds public keys to document.
   */
  private static addPublicKeys(
    document: DocumentModel,
    patch: any
  ): DocumentModel {
    const publicKeyMap = new Map(
      (document.publicKeys || []).map((publicKey) => [publicKey.id, publicKey])
    );

    // Loop through all given public keys and add them if they don't exist already.
    for (const publicKey of patch.publicKeys) {
      // NOTE: If a key ID already exists, we will just replace the existing key.
      // Not throwing error will minimize the need (thus risk) of reusing exposed update reveal value.
      publicKeyMap.set(publicKey.id, publicKey);
    }

    document.publicKeys = [...publicKeyMap.values()];

    return document;
  }

  /**
   * Removes public keys from document.
   */
  private static removePublicKeys(
    document: DocumentModel,
    patch: any
  ): DocumentModel {
    const publicKeyMap = new Map(
      (document.publicKeys || []).map((publicKey) => [publicKey.id, publicKey])
    );

    // Loop through all given public key IDs and delete them from the existing public key only if it is not a recovery key.
    for (const publicKey of patch.publicKeys) {
      const existingKey = publicKeyMap.get(publicKey);

      if (existingKey !== undefined) {
        publicKeyMap.delete(publicKey);
      }
      // NOTE: Else we will just treat this key removal as a no-op.
      // Not throwing error will minimize the need (thus risk) of reusing exposed update reveal value.
    }

    document.publicKeys = [...publicKeyMap.values()];

    return document;
  }

  private static addServiceEndpoints(
    document: DocumentModel,
    patch: any
  ): DocumentModel {
    const serviceEndpoints = patch.serviceEndpoints;

    if (document.serviceEndpoints === undefined) {
      // create a new array if service did not exist
      document.serviceEndpoints = [];
    }

    const idToIndexMapper = new Map();
    // map all id and their index
    for (const idx in document.serviceEndpoints) {
      idToIndexMapper.set(document.serviceEndpoints[idx].id, idx);
    }

    for (const serviceEndpoint of serviceEndpoints) {
      if (idToIndexMapper.has(serviceEndpoint.id)) {
        const idx = idToIndexMapper.get(serviceEndpoint.id);
        document.serviceEndpoints[idx] = serviceEndpoint;
      } else {
        document.serviceEndpoints.push(serviceEndpoint);
      }
    }

    return document;
  }

  private static removeServiceEndpoints(
    document: DocumentModel,
    patch: any
  ): DocumentModel {
    if (document.serviceEndpoints === undefined) {
      return document;
    }

    const idsToRemove = new Set(patch.ids);
    document.serviceEndpoints = document.serviceEndpoints.filter(
      (serviceEndpoint) => !idsToRemove.has(serviceEndpoint.id)
    );

    return document;
  }
}