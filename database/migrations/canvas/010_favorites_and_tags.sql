-- Per-user favorites over any resource kind (asset | library_entry | entity).
CREATE TABLE canvas.favorites (
  user_id UUID NOT NULL REFERENCES canvas.users(id) ON DELETE CASCADE,
  target_type VARCHAR(30) NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX idx_favorites_target ON canvas.favorites(target_type, target_id);

-- Tag filtering on assets (tags && ARRAY[...]).
CREATE INDEX idx_assets_tags ON canvas.assets USING GIN (tags);
