import { useState, useEffect } from 'react';
import { fetchApi, postApi, deleteApi } from '../api';

interface PricingEntry {
  input: number;
  output: number;
}

const PROVIDERS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-haiku-3.5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5', 'gpt-5-mini', 'gpt-5-codex', 'gpt-5.1-codex', 'gpt-5.2-codex', 'o3', 'o4-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  deepseek: ['deepseek-r1', 'deepseek-v3'],
};

export default function Pricing() {
  const [pricing, setPricing] = useState<Record<string, PricingEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { input: string; output: string }>>({});
  const [addModel, setAddModel] = useState('');
  const [addInput, setAddInput] = useState('');
  const [addOutput, setAddOutput] = useState('');
  const [addError, setAddError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = () => {
    fetchApi<Record<string, PricingEntry>>('/api/pricing')
      .then(data => { setPricing(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const startEdit = (model: string) => {
    setEditValues(ev => ({
      ...ev,
      [model]: { input: String(pricing[model].input), output: String(pricing[model].output) },
    }));
  };

  const cancelEdit = (model: string) => {
    setEditValues(ev => { const n = { ...ev }; delete n[model]; return n; });
  };

  const saveModel = async (model: string) => {
    const vals = editValues[model];
    const inp = parseFloat(vals.input);
    const out = parseFloat(vals.output);
    if (isNaN(inp) || isNaN(out) || inp < 0 || out < 0) return;
    setSaving(model);
    try {
      await postApi('/api/pricing', { model, input: inp, output: out });
      cancelEdit(model);
      load();
      flash(`Saved ${model}`);
    } finally {
      setSaving(null);
    }
  };

  const deleteModel = async (model: string) => {
    setDeleting(model);
    try {
      await deleteApi(`/api/pricing/${encodeURIComponent(model)}`);
      load();
      flash(`Reset ${model} to default`);
    } finally {
      setDeleting(null);
    }
  };

  const addNewModel = async () => {
    setAddError('');
    if (!addModel.trim()) { setAddError('Model name is required'); return; }
    const inp = parseFloat(addInput);
    const out = parseFloat(addOutput);
    if (isNaN(inp) || inp < 0) { setAddError('Invalid input price'); return; }
    if (isNaN(out) || out < 0) { setAddError('Invalid output price'); return; }
    setSaving('__new__');
    try {
      await postApi('/api/pricing', { model: addModel.trim(), input: inp, output: out });
      setAddModel(''); setAddInput(''); setAddOutput('');
      load();
      flash(`Added ${addModel.trim()}`);
    } finally {
      setSaving(null);
    }
  };

  const grouped = Object.entries(PROVIDERS).map(([provider, models]) => ({
    provider,
    models: models.filter(m => pricing[m]),
  })).filter(g => g.models.length > 0);

  const knownModels = new Set(Object.values(PROVIDERS).flat());
  const customModels = Object.keys(pricing).filter(m => !knownModels.has(m));

  if (loading) return <div className="pricing-page"><p className="loading-text">Loading pricing...</p></div>;

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <h1>Model Pricing</h1>
        <p className="pricing-subtitle">
          Prices are per 1 million tokens. Edit any model or add a custom one.
          Changes are saved to <code>~/.codesession/pricing.json</code>.
        </p>
        {successMsg && <div className="pricing-success">{successMsg}</div>}
      </div>

      {grouped.map(({ provider, models }) => (
        <section key={provider} className="pricing-section">
          <h2 className="pricing-provider">{provider}</h2>
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input ($/1M)</th>
                <th>Output ($/1M)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map(model => {
                const isEditing = !!editValues[model];
                const vals = editValues[model] || { input: '', output: '' };
                return (
                  <tr key={model}>
                    <td className="pricing-model">{model}</td>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            className="pricing-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={vals.input}
                            onChange={e => setEditValues(ev => ({ ...ev, [model]: { ...vals, input: e.target.value } }))}
                          />
                        </td>
                        <td>
                          <input
                            className="pricing-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={vals.output}
                            onChange={e => setEditValues(ev => ({ ...ev, [model]: { ...vals, output: e.target.value } }))}
                          />
                        </td>
                        <td className="pricing-actions">
                          <button
                            className="pricing-btn pricing-btn--save"
                            onClick={() => saveModel(model)}
                            disabled={saving === model}
                          >
                            {saving === model ? 'Saving...' : 'Save'}
                          </button>
                          <button className="pricing-btn pricing-btn--cancel" onClick={() => cancelEdit(model)}>
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="pricing-value">${pricing[model].input.toFixed(2)}</td>
                        <td className="pricing-value">${pricing[model].output.toFixed(2)}</td>
                        <td className="pricing-actions">
                          <button className="pricing-btn pricing-btn--edit" onClick={() => startEdit(model)}>
                            Edit
                          </button>
                          <button
                            className="pricing-btn pricing-btn--reset"
                            onClick={() => deleteModel(model)}
                            disabled={deleting === model}
                            title="Reset to default"
                          >
                            {deleting === model ? '...' : 'Reset'}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {customModels.length > 0 && (
        <section className="pricing-section">
          <h2 className="pricing-provider">Custom Models</h2>
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input ($/1M)</th>
                <th>Output ($/1M)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customModels.map(model => {
                const isEditing = !!editValues[model];
                const vals = editValues[model] || { input: '', output: '' };
                return (
                  <tr key={model}>
                    <td className="pricing-model">{model}</td>
                    {isEditing ? (
                      <>
                        <td>
                          <input className="pricing-input" type="number" min="0" step="0.01" value={vals.input}
                            onChange={e => setEditValues(ev => ({ ...ev, [model]: { ...vals, input: e.target.value } }))} />
                        </td>
                        <td>
                          <input className="pricing-input" type="number" min="0" step="0.01" value={vals.output}
                            onChange={e => setEditValues(ev => ({ ...ev, [model]: { ...vals, output: e.target.value } }))} />
                        </td>
                        <td className="pricing-actions">
                          <button className="pricing-btn pricing-btn--save" onClick={() => saveModel(model)} disabled={saving === model}>
                            {saving === model ? 'Saving...' : 'Save'}
                          </button>
                          <button className="pricing-btn pricing-btn--cancel" onClick={() => cancelEdit(model)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="pricing-value">${pricing[model].input.toFixed(2)}</td>
                        <td className="pricing-value">${pricing[model].output.toFixed(2)}</td>
                        <td className="pricing-actions">
                          <button className="pricing-btn pricing-btn--edit" onClick={() => startEdit(model)}>Edit</button>
                          <button className="pricing-btn pricing-btn--reset" onClick={() => deleteModel(model)} disabled={deleting === model}>
                            {deleting === model ? '...' : 'Delete'}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="pricing-section pricing-add">
        <h2 className="pricing-provider">Add Custom Model</h2>
        <p className="pricing-add-hint">Add any model not in the list above. Use this for new releases or private models.</p>
        <div className="pricing-add-row">
          <input
            className="pricing-input pricing-input--model"
            type="text"
            placeholder="model name (e.g. gpt-6)"
            value={addModel}
            onChange={e => setAddModel(e.target.value)}
          />
          <input
            className="pricing-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="input $/1M"
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
          />
          <input
            className="pricing-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="output $/1M"
            value={addOutput}
            onChange={e => setAddOutput(e.target.value)}
          />
          <button
            className="pricing-btn pricing-btn--save"
            onClick={addNewModel}
            disabled={saving === '__new__'}
          >
            {saving === '__new__' ? 'Adding...' : 'Add Model'}
          </button>
        </div>
        {addError && <p className="pricing-error">{addError}</p>}
      </section>
    </div>
  );
}
