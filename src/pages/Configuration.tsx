import { Plus, Save, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { SystemConfig } from "../server/schemas/system_config";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

const CWButton = lazy(() =>
  import("../components/cryptowatch").then((m) => ({
    default: m.CWButton,
  })),
);
const CWInput = lazy(() =>
  import("../components/cryptowatch/Input").then((m) => ({
    default: m.CWInput,
  })),
);
const CWSelect = lazy(() =>
  import("../components/cryptowatch/Select").then((m) => ({
    default: m.CWSelect,
  })),
);

// Since we cannot verify if strict schema parsing works in frontend without trying,
// we will rely on fetching JSON and casting it, then sending it back.
// The server validates it anyway.

function ConfigurationComponent() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/config?format=json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load config");
        return res.json();
      })
      .then((data) => setConfig(data))
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus("error");
      });
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setErrorMessage(json.error || "Unknown error");
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message);
    }
  };

  const updateSection = (section: keyof SystemConfig, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [section]: value } : null));
  };

  if (!config)
    return <div className="p-8 text-[#e0e0e0]">Loading config...</div>;

  return (
    <Suspense
      fallback={
        <div className="p-8 text-[#e0e0e0]">Loading configuration UI...</div>
      }
    >
      <div className="flex-1 overflow-y-auto bg-[#000000] text-[#e0e0e0] font-mono scrollbar-thin scrollbar-thumb-gray-800">
        <div className="p-4 w-full space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center pb-6 border-b border-[#1a1a1a]">
            <div>
              <h1 className="text-2xl font-light text-blue-400">
                System Configuration
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage data sources and pipeline settings
              </p>
            </div>
            <div className="flex items-center gap-4">
              {status === "error" && (
                <span className="text-sm text-red-500">{errorMessage}</span>
              )}
              {status === "success" && (
                <span className="text-sm text-green-500">
                  Saved Successfully
                </span>
              )}
              <CWButton onClick={handleSave} disabled={status === "saving"}>
                <Save size={16} className="mr-2" />
                {status === "saving" ? "Saving..." : "Save Config"}
              </CWButton>
            </div>
          </div>

          {/* Modules */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Section title="Polymarket" enabled={config.polymarket.enabled}>
              <PolymarketForm
                data={config.polymarket}
                onChange={(v) => updateSection("polymarket", v)}
              />
            </Section>

            <Section
              title="Pizza Radar (OSINT)"
              enabled={config.pizza_radar.enabled}
            >
              <PizzaRadarForm
                data={config.pizza_radar}
                onChange={(v) => updateSection("pizza_radar", v)}
              />
            </Section>

            <Section
              title="OKLink (Blockchain)"
              enabled={config.oklink.enabled}
            >
              <OKLinkForm
                data={config.oklink}
                onChange={(v) => updateSection("oklink", v)}
              />
            </Section>

            <Section
              title="Solana Watchdog"
              enabled={config.solana?.enabled ?? false}
            >
              <SolanaForm
                data={
                  config.solana || {
                    enabled: false,
                    rpc_url: "",
                    commitment: "confirmed",
                    watchdog: [],
                  }
                }
                onChange={(v) => updateSection("solana", v)}
              />
            </Section>
          </div>
        </div>
      </div>
    </Suspense>
  );
}

export const Configuration = withErrorBoundary(ConfigurationComponent, {
  title: "Configuration",
});

// --- SUB-COMPONENTS ---

function Section({
  title,
  enabled,
  children,
}: {
  title: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border transition-all duration-200 ${
        enabled
          ? "border-blue-900/40 bg-black"
          : "border-[#1a1a1a] bg-black opacity-70 grayscale"
      }`}
    >
      <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between">
        <h2
          className={`text-lg font-medium ${
            enabled ? "text-blue-300" : "text-gray-500"
          }`}
        >
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${enabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-700"}`}
          ></span>
          <span className="text-xs text-gray-500 uppercase">
            {enabled ? "Active" : "Disabled"}
          </span>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// 1. Polymarket
function PolymarketForm({
  data,
  onChange,
}: {
  data: SystemConfig["polymarket"];
  onChange: (d: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-400">
          Module Status
        </label>
        <Toggle
          value={data.enabled}
          onChange={(v) => onChange({ ...data, enabled: v })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CWInput
          autoComplete="off"
          label="Whale Threshold (Shares)"
          type="number"
          value={data.whale_threshold_shares}
          onChange={(e) =>
            onChange({
              ...data,
              whale_threshold_shares: Number(e.target.value),
            })
          }
        />
        <CWInput
          autoComplete="off"
          label="Whale Threshold (USDC)"
          type="number"
          value={data.whale_threshold_usdc}
          onChange={(e) =>
            onChange({ ...data, whale_threshold_usdc: Number(e.target.value) })
          }
        />
      </div>

      <StringList
        label="Monitored Users (Wallet Addresses or IDs)"
        items={data.monitored_users}
        onChange={(items) => onChange({ ...data, monitored_users: items })}
      />
    </div>
  );
}

// 2. Pizza Radar
function PizzaRadarForm({
  data,
  onChange,
}: {
  data: SystemConfig["pizza_radar"];
  onChange: (d: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-400">
          Module Status
        </label>
        <Toggle
          value={data.enabled}
          onChange={(v) => onChange({ ...data, enabled: v })}
        />
      </div>

      <StringList
        label="Places of Interest (Keywords)"
        items={data.places_of_interest}
        onChange={(items) => onChange({ ...data, places_of_interest: items })}
      />
    </div>
  );
}

// 3. OKLink
function OKLinkForm({
  data,
  onChange,
}: {
  data: SystemConfig["oklink"];
  onChange: (d: any) => void;
}) {
  const addresses = data.addresses || [];

  const addAddress = () => {
    onChange({
      ...data,
      addresses: [
        ...addresses,
        { address: "", alias: "", chain: "polygon", description: "" },
      ],
    });
  };

  const removeAddress = (idx: number) => {
    const next = [...addresses];
    next.splice(idx, 1);
    onChange({ ...data, addresses: next });
  };

  const updateAddress = (idx: number, field: string, val: string) => {
    const next = [...addresses];
    next[idx] = { ...next[idx], [field]: val };
    onChange({ ...data, addresses: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-400">
            Module Status
          </label>
          <Toggle
            value={data.enabled}
            onChange={(v) => onChange({ ...data, enabled: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CWInput
          autoComplete="off"
          label="API Key"
          type="password"
          value={data.api_key}
          onChange={(e) => onChange({ ...data, api_key: e.target.value })}
        />
        <CWInput
          autoComplete="off"
          label="Polling Interval (ms)"
          type="number"
          value={data.interval_ms}
          onChange={(e) =>
            onChange({ ...data, interval_ms: Number(e.target.value) })
          }
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-400">
          Monitored Addresses
        </label>
        {addresses.map((addr, idx) => (
          <div
            key={idx}
            className="bg-[#0f0f0f] border border-[#222] p-4 rounded-md grid grid-cols-12 gap-4 items-end"
          >
            <div className="col-span-12 md:col-span-4">
              <CWInput
                autoComplete="off"
                label="Alias"
                value={addr.alias}
                onChange={(e) => updateAddress(idx, "alias", e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <CWInput
                autoComplete="off"
                label="Address"
                value={addr.address}
                onChange={(e) => updateAddress(idx, "address", e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-2 flex justify-end pb-1">
              <CWButton
                variant="ghost"
                onClick={() => removeAddress(idx)}
                className="text-red-500 hover:text-red-400"
              >
                <Trash2 size={16} />
              </CWButton>
            </div>
          </div>
        ))}
        <CWButton
          variant="outline"
          onClick={addAddress}
          className="w-full border-dashed border-gray-700 text-gray-500 hover:text-blue-400"
        >
          <Plus size={16} className="mr-2" /> Add Address
        </CWButton>
      </div>
    </div>
  );
}

// 4. Solana
function SolanaForm({
  data,
  onChange,
}: {
  data: SystemConfig["solana"];
  onChange: (d: any) => void;
}) {
  const watchdogs = data.watchdog || [];

  const addDog = () => {
    onChange({
      ...data,
      watchdog: [...watchdogs, { name: "", address: "", description: "" }],
    });
  };

  const removeDog = (idx: number) => {
    const next = [...watchdogs];
    next.splice(idx, 1);
    onChange({ ...data, watchdog: next });
  };

  const updateDog = (idx: number, field: string, val: string) => {
    const next = [...watchdogs];
    next[idx] = { ...next[idx], [field]: val };
    onChange({ ...data, watchdog: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-400">
          Module Status
        </label>
        <Toggle
          value={data.enabled}
          onChange={(v) => onChange({ ...data, enabled: v })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CWInput
          autoComplete="off"
          label="RPC URL"
          value={data.rpc_url}
          onChange={(e) => onChange({ ...data, rpc_url: e.target.value })}
        />
        <CWSelect
          label="Commitment"
          options={[
            { value: "processed", label: "Processed" },
            { value: "confirmed", label: "Confirmed" },
            { value: "finalized", label: "Finalized" },
          ]}
          value={data.commitment}
          onChange={(e) => onChange({ ...data, commitment: e.target.value })}
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-400">
          Watchdogs (Address Monitors)
        </label>
        {watchdogs.map((dog, idx) => (
          <div
            key={idx}
            className="bg-[#0f0f0f] border border-[#222] p-4 rounded-md grid grid-cols-12 gap-4 items-end"
          >
            <div className="col-span-12 md:col-span-3">
              <CWInput
                autoComplete="off"
                label="Name"
                placeholder="my-wallet"
                value={dog.name}
                onChange={(e) => updateDog(idx, "name", e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-5">
              <CWInput
                autoComplete="off"
                label="Address"
                placeholder="Solana Address..."
                value={dog.address}
                onChange={(e) => updateDog(idx, "address", e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-3">
              <CWInput
                autoComplete="off"
                label="Description"
                placeholder="Optional notes"
                value={dog.description || ""}
                onChange={(e) => updateDog(idx, "description", e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-1 flex justify-end pb-1">
              <CWButton
                variant="ghost"
                onClick={() => removeDog(idx)}
                className="text-red-500 hover:text-red-400"
              >
                <Trash2 size={16} />
              </CWButton>
            </div>
          </div>
        ))}
        <CWButton
          variant="outline"
          onClick={addDog}
          className="w-full border-dashed border-gray-700 text-gray-500 hover:text-blue-400"
        >
          <Plus size={16} className="mr-2" /> Add Watchdog
        </CWButton>
      </div>
    </div>
  );
}

// --- GENERAL HELPERS ---

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out relative ${value ? "bg-blue-600" : "bg-gray-700"}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${value ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

function StringList({
  label,
  items: rawItems,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const items = rawItems || [];

  const add = () => {
    if (!newItem.trim()) return;
    onChange([...items, newItem.trim()]);
    setNewItem("");
  };

  const remove = (idx: number) => {
    const next = [...items];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-400">{label}</label>
      <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-lg overflow-hidden">
        {items.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-600 italic">
            No items added
          </div>
        )}
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 border-b border-[#1a1a1a] last:border-0 hover:bg-[#151515]"
          >
            <span className="text-sm text-gray-300 font-mono">{item}</span>
            <button
              onClick={() => remove(idx)}
              className="text-gray-500 hover:text-red-500 px-2"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="p-2 flex gap-2 bg-[#151515]">
          <input
            className="flex-1 bg-transparent border-none text-sm px-2 focus:outline-none"
            placeholder="Type new item and press Enter..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <CWButton size="sm" onClick={add} disabled={!newItem.trim()}>
            Add
          </CWButton>
        </div>
      </div>
    </div>
  );
}
