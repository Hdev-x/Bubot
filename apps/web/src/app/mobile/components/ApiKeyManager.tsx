// API 키 관리 컴포넌트 — AssetsPage 내에서 사용
import { useState, useEffect, useCallback } from 'react';
import { fetchApiKeys, saveApiKey, activateApiKey, deleteApiKey, type ApiKeyItem } from '../../../api/server/apiKeysApi';
import { fetchMe } from '../../../api/server/authApi';
import { SUB_ACCOUNT_NAMES } from '../../../config/accountTargets';
import { EXCHANGES, EXCHANGE_OPTIONS, type ExchangeId } from '../../../shared/constants/exchanges';

// 봇 슬롯 선택지 — MAIN + Bot 1~7
const BOT_TARGETS: { value: string; label: string }[] = [
  { value: 'MAIN', label: 'Main 계정' },
  ...Object.entries(SUB_ACCOUNT_NAMES).map(([value, label]) => ({ value, label: `${label} (${value})` })),
];

function targetLabel(target: string): string {
  if (target === 'MAIN') return 'Main';
  return SUB_ACCOUNT_NAMES[target] || target;
}

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState({ exchange: 'BITGET' as ExchangeId, apiKey: '', secretKey: '', passphrase: '', label: '', botTarget: 'MAIN' });
  const [saving, setSaving] = useState(false);
  const exMeta = EXCHANGES[form.exchange];

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await fetchApiKeys();
      setKeys(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchMe().then(u => setIsAdmin(u?.role === 'ADMIN')).catch(() => {}); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // passphrase는 비트겟만 필수 — 거래소별로 필요한 필드만 검증.
    const needPass = exMeta.requiresPassphrase;
    if (!form.apiKey.trim() || !form.secretKey.trim() || (needPass && !form.passphrase.trim())) {
      setError('필수 필드를 모두 입력해주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveApiKey({
        apiKey: form.apiKey,
        secretKey: form.secretKey,
        passphrase: needPass ? form.passphrase : '',
        label: form.label,
        exchange: form.exchange,
        botTarget: form.botTarget,
      });
      setForm({ exchange: form.exchange, apiKey: '', secretKey: '', passphrase: '', label: '', botTarget: 'MAIN' });
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: number) {
    try {
      await activateApiKey(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 API 키를 삭제하시겠습니까?')) return;
    try {
      await deleteApiKey(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // 스타일은 styles.css의 프리미엄 클래스 적용
  return (
    <div className="api-key-manager premium-panel" style={{ padding: '20px' }}>
      <div className="premium-panel-header">
        <h3>거래소 API 키</h3>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className={showForm ? "btn-secondary" : "btn-glow"}
          style={{ padding: '6px 14px', fontSize: '13px' }}
        >
          {showForm ? '취소' : '+ 키 추가'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#f6465d', fontSize: 13, background: 'rgba(246, 70, 93, 0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 입력 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 거래소 선택 — 칩. 선택에 따라 아래 입력 필드가 달라진다. */}
            <div>
              <label className="premium-label">거래소</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXCHANGE_OPTIONS.map(ex => {
                  const on = form.exchange === ex.id;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, exchange: ex.id }))}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 13px', borderRadius: 10, cursor: 'pointer',
                        border: on ? '1px solid var(--blue, #3182F6)' : '1px solid rgba(255,255,255,0.1)',
                        background: on ? 'rgba(49,130,246,0.12)' : 'transparent',
                        color: on ? 'var(--text, #eaecef)' : 'var(--muted, #8b8e97)',
                        fontSize: 13, fontWeight: on ? 700 : 500,
                      }}
                    >
                      <img src={ex.logo} alt="" style={{ width: 16, height: 16 }} />
                      {ex.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {form.exchange !== 'BITGET' && (
              <div style={{ fontSize: 12, color: 'var(--muted, #8b8e97)', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
                ℹ️ {exMeta.label}는 입력 UI만 준비된 상태예요. 키를 저장해두면 연동 작업 후 바로 사용됩니다.
              </div>
            )}
            {isAdmin && (
              <div>
                <label className="premium-label">봇 슬롯</label>
                <select
                  value={form.botTarget}
                  onChange={e => setForm(p => ({ ...p, botTarget: e.target.value }))}
                  className="premium-input"
                >
                  {BOT_TARGETS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}
            <InputField label={exMeta.apiKeyLabel} value={form.apiKey} onChange={v => setForm(p => ({ ...p, apiKey: v }))} placeholder={exMeta.apiKeyPlaceholder} />
            <InputField label={exMeta.secretKeyLabel} value={form.secretKey} onChange={v => setForm(p => ({ ...p, secretKey: v }))} placeholder={exMeta.secretKeyLabel} />
            {exMeta.requiresPassphrase && (
              <InputField label="Passphrase" value={form.passphrase} onChange={v => setForm(p => ({ ...p, passphrase: v }))} placeholder="Passphrase" />
            )}
            <InputField label="라벨 (선택)" value={form.label} onChange={v => setForm(p => ({ ...p, label: v }))} placeholder="예: 내 SOL 봇" />
            
            <button
              type="submit"
              disabled={saving}
              className="btn-glow"
              style={{ marginTop: '8px', width: '100%' }}
            >
              {saving ? '저장 중...' : 'API 키 저장'}
            </button>
          </div>
        </form>
      )}

      {/* 키 목록 */}
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>불러오는 중...</div>
      ) : keys.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '30px 0', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          등록된 API 키가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {keys.map(key => (
            <div key={key.id} className="premium-list-item">
              <div>
                <div style={{ fontSize: 14, color: 'var(--text)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {EXCHANGES[key.exchange as ExchangeId]?.logo && (
                    <img src={EXCHANGES[key.exchange as ExchangeId].logo} alt={key.exchange} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{key.maskedApiKey}</span>
                  {key.active && (
                    <span className="badge-neon active">
                      Active
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{targetLabel(key.botTarget)}</span>
                  <span style={{ opacity: 0.5 }}>|</span>
                  <span>{key.label || key.exchange}</span>
                  <span style={{ opacity: 0.5 }}>|</span>
                  <span>{key.createdAt}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!key.active && (
                  <button
                    type="button"
                    onClick={() => handleActivate(key.id)}
                    className="btn-success-outline"
                  >
                    활성화
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(key.id)}
                  className="btn-danger-outline"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 작은 헬퍼 — 모던 인라인 폼 필드
function InputField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="premium-label">{label}</label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="premium-input"
      />
    </div>
  );
}