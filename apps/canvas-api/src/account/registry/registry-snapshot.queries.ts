export const historyModelSql = `
  SELECT rr.id AS revision_id, r.source_id, s.kind AS source_kind,
         latest.release_id, rr.content_digest, rr.document
    FROM account.catalog_resource_revisions rr
    JOIN account.catalog_resources r ON r.resource_uid = rr.resource_uid
    JOIN account.catalog_sources s ON s.source_id = r.source_id
    LEFT JOIN LATERAL (
      SELECT re.release_id
        FROM account.catalog_release_entries re
        JOIN account.catalog_releases rel ON rel.release_id = re.release_id
       WHERE re.resource_uid = rr.resource_uid AND re.revision = rr.revision
       ORDER BY rel.sequence DESC LIMIT 1
    ) latest ON true
   WHERE r.kind = 'model_offering'`;

export const historyRateSql = historyModelSql.replace(
  "r.kind = 'model_offering'",
  "r.kind = 'rate_card'",
);
