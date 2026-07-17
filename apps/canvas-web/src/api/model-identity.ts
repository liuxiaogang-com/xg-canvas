export interface ModelCatalogIdentity {
  model_id: string;
  model_resource_uid: string;
  model_revision_id: string;
  catalog_epoch: string;
}

export function modelSchemaCacheKey(identity: ModelCatalogIdentity): string {
  return [identity.model_resource_uid, identity.model_revision_id, identity.catalog_epoch].join(
    ':',
  );
}

export function modelIdentityDependency(identity: ModelCatalogIdentity | string): string {
  return typeof identity === 'string'
    ? `model-id:${identity}`
    : `pin:${modelSchemaCacheKey(identity)}`;
}
