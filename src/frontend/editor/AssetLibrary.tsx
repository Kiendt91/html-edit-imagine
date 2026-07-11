import { Database, RefreshCcw, Trash2 } from "lucide-react";
import type { AssetRef, LayoutDocument } from "../types";

type AssetLibraryProps = {
  assets: AssetRef[];
  document: LayoutDocument;
  onRefresh: () => void;
  onUse: (asset: AssetRef) => void;
  onDelete: (asset: AssetRef) => void;
};

export function AssetLibrary({ assets, document, onRefresh, onUse, onDelete }: AssetLibraryProps) {
  return (
    <div className="assetLibrary">
      <div className="panelTitle smallTitle">
        <Database size={15} />
        <span>Asset Library</span>
        <button className="iconButton" onClick={onRefresh} title="Refresh assets">
          <RefreshCcw size={14} />
        </button>
      </div>
      {assets.length === 0 ? (
        <div className="miniEmpty">No uploaded assets yet.</div>
      ) : (
        <div className="assetList">
          {assets.slice(0, 10).map((asset) => {
            const inCurrentLayout = Boolean(document.assets.some((item) => item.id === asset.id) || document.objects.some((object) => object.assetId === asset.id));
            return (
              <article key={asset.id} className="assetCard">
                <img className="assetThumb" src={asset.src} alt={asset.name} />
                <div className="assetMeta">
                  <strong>{asset.name}</strong>
                  <span>{asset.kind} - {asset.width} x {asset.height}</span>
                </div>
                <div className="assetActions">
                  <button disabled={asset.kind === "source-layout"} onClick={() => onUse(asset)}>
                    Use
                  </button>
                  <button disabled={inCurrentLayout} className="dangerMiniButton" onClick={() => onDelete(asset)} title={inCurrentLayout ? "Asset is used by this layout" : `Delete ${asset.name}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
