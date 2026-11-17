'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, CircleHelp, CreditCard, Ellipsis, HeartHandshake, Home, Landmark, Plus, RefreshCw, RotateCcw, Send, ShieldCheck, Sparkles, Trash2, Wallet, X } from 'lucide-react'

type Account = { id: string; name: string; balance: number; status: 'up' | 'slow' | 'blocked' | 'down'; priority: number; allow_reroute: boolean }
type MoneyItem = { id: string; name: string; amount: number; cycle: string; date: string; account: string; type: 'subscription' | 'bill' | 'owed'; payment: string; trial?: string; lastUsed?: string; paid?: boolean }
type LogItem = { id: string; title: string; detail: string; amount: number; date: string; status: string }
type Demo = { accounts: Account[]; items: MoneyItem[]; logs: LogItem[]; rules: { auto_reroute: boolean; confirm_above: number; keep_buffer: number } }
const seed: Demo = {
  accounts: [
    { id: 'santander', name: 'Santander', balance: 1840, status: 'up', priority: 1, allow_reroute: true },
    { id: 'revolut', name: 'Revolut', balance: 1250, status: 'up', priority: 2, allow_reroute: true },
    { id: 'n26', name: 'N26', balance: 980, status: 'up', priority: 3, allow_reroute: true },
  ],
  items: [
    { id: 'i1', name: 'Spotify Premium', amount: 10.99, cycle: 'Monthly', date: 'Nov 20', account: 'revolut', type: 'subscription', payment: 'Card', trial: '', lastUsed: 'Nov 12' },
    { id: 'i2', name: 'Adobe Creative Cloud', amount: 19.99, cycle: 'Monthly', date: 'Nov 22', account: 'santander', type: 'subscription', payment: 'Card', trial: 'Nov 19', lastUsed: 'Oct 4' },
    { id: 'i3', name: 'Gym membership', amount: 29.9, cycle: 'Monthly', date: 'Nov 25', account: 'n26', type: 'subscription', payment: 'Direct debit', lastUsed: 'Sep 20' },
    { id: 'i4', name: 'Electricity', amount: 48, cycle: 'Monthly', date: 'Nov 21', account: 'santander', type: 'bill', payment: 'Direct debit' },
    { id: 'i5', name: 'Phone bill', amount: 24, cycle: 'Monthly', date: 'Nov 24', account: 'revolut', type: 'bill', payment: 'Direct debit' },
    { id: 'i6', name: 'Maya Chen', amount: 32, cycle: 'One-off', date: 'Nov 16', account: 'revolut', type: 'owed', payment: 'Lunch last week' },
    { id: 'i7', name: 'Leo Martin', amount: 18, cycle: 'One-off', date: 'Nov 14', account: 'n26', type: 'owed', payment: 'Cinema tickets', paid: true },
  ],
  logs: [
    { id: 'l1', title: 'Coffee Club', detail: 'Paid with Revolut · Card', amount: -4.8, date: 'Today, 10:42', status: 'paid' },
    { id: 'l2', title: 'Monthly rent', detail: 'Santander · Direct debit', amount: -650, date: 'Yesterday', status: 'paid' },
    { id: 'l3', title: 'From Mum', detail: 'Received to Santander', amount: 150, date: 'Nov 14', status: 'received' },
  ],
  rules: { auto_reroute: true, confirm_above: 200, keep_buffer: 50 },
}
const fmt = (n: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n)
const accountStatus: Record<string, string> = { up: 'All good', slow: 'Running slow', blocked: 'Payments blocked', down: 'Outage' }
const navItems = [{ id: 'home', label: 'Home', icon: Home }, { id: 'reroute', label: 'Reroute', icon: RefreshCw }, { id: 'money', label: 'Money', icon: Wallet }, { id: 'activity', label: 'Activity', icon: Activity }]

export default function SynavoApp() {
  const [data, setData] = useState<Demo>(seed)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('home')
  const [moneyTab, setMoneyTab] = useState<'subscription' | 'bill' | 'owed'>('subscription')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('santander')
  const [paymentType, setPaymentType] = useState<'card' | 'direct_debit'>('card')
  const [attempts, setAttempts] = useState<{account:string; role:string; result:string; reason:string}[]>([])
  const [paymentState, setPaymentState] = useState('')
  const [resultStatus, setResultStatus] = useState('')
  const [tips, setTips] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAmount, setDraftAmount] = useState('')
  const [draftDate, setDraftDate] = useState('Nov 28')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    try { const saved = localStorage.getItem('synavo-demo-v1'); if (saved) setData(JSON.parse(saved)) } catch {}
    setReady(true)
  }, [])
  useEffect(() => { if (ready) localStorage.setItem('synavo-demo-v1', JSON.stringify(data)) }, [data, ready])
  const subscriptions = data.items.filter(i => i.type === 'subscription')
  const totalMonthly = subscriptions.reduce((sum, i) => sum + i.amount, 0)
  const dueSoon = data.items.filter(i => i.type !== 'owed' && !i.paid).length
  const activeAlerts = useMemo(() => [
    ...data.items.filter(i => i.type === 'subscription' && i.trial).map(i => ({ icon: 'spark', title: `${i.name} trial ends ${i.trial}`, body: 'Cancel before then to avoid being charged.', color: 'amber' })),
    ...data.items.filter(i => i.type === 'subscription' && i.lastUsed && (Date.now() - new Date(i.lastUsed + ', 2026').getTime()) > 30 * 86400000).map(i => ({ icon: 'unused', title: `${i.name} hasn’t been used in 30+ days`, body: `That’s ${fmt(i.amount * 12)} a year if you let it renew.`, color: 'violet' })),
    ...data.items.filter(i => i.type === 'bill' && data.accounts.find(a => a.id === i.account)?.status === 'down').map(i => ({ icon: 'bill', title: `${i.name} is due on an account outage`, body: 'Reroute to avoid a missed payment.', color: 'red' })),
    ...data.items.filter(i => i.type === 'owed' && !i.paid).map(i => ({ icon: 'owed', title: `${i.name} owes you ${fmt(i.amount)}`, body: 'A friendly nudge can help.', color: 'mint' })),
  ], [data])
  const log = (title: string, detail: string, value: number, status = 'paid') => setData(d => ({ ...d, logs: [{ id: crypto.randomUUID(), title, detail, amount: value, date: 'Just now', status }, ...d.logs] }))
  const changeStatus = (id: string) => setData(d => ({ ...d, accounts: d.accounts.map(a => a.id === id ? { ...a, status: ({ up: 'down', down: 'slow', slow: 'blocked', blocked: 'up' } as const)[a.status] } : a) }))
  const runPayment = async (confirmed = false) => {
    if (!payee.trim() || !Number(amount) || Number(amount) <= 0) { setPaymentState('Add a payee and a valid amount to continue.'); return }
    setBusy(true); setPaymentState('Checking payment routes…'); setAttempts([]); setResultStatus(''); setTips([])
    const payload = { payment: { payee, amount: Number(amount), type: paymentType }, primary_account_id: source, accounts: data.accounts.map(a => ({ ...a, status: a.status as Account['status'] })), rules: data.rules, confirmed }
    let result: { status: string; paid_from_account_id: string | null; proposed_account_id: string | null; message: string; attempts: { account: string; role: string; result: string; reason: string }[]; tips: string[] }
    try {
      const response = await fetch('/api/reroute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error('No demo API')
      result = await response.json()
      const roles: Record<string, string> = { original: 'Primary account', backup: 'Backup account' }
      result.attempts = result.attempts.map(a => ({ ...a, role: roles[a.role] || a.role, result: a.result === 'available' ? 'success' : a.result }))
    } catch {
      const primary = data.accounts.find(a => a.id === source)!
      const backups = [...data.accounts].filter(a => a.id !== source && a.allow_reroute).sort((a,b) => a.priority-b.priority)
      const canPay = (a: Account) => a.status === 'up' && a.balance - Number(amount) >= data.rules.keep_buffer
      const backup = backups.find(canPay)
      const first = { account: primary.name, role: 'Primary account', result: primary.status === 'up' && canPay(primary) ? 'success' : 'failed', reason: primary.status !== 'up' ? accountStatus[primary.status] : (canPay(primary) ? 'Payment accepted' : 'Keep €50 buffer') }
      const next = backup ? { account: backup.name, role: 'Backup account', result: 'success', reason: 'Available balance and account are healthy' } : null
      const needsConfirm = Number(amount) > data.rules.confirm_above && !confirmed
      result = { status: needsConfirm ? 'needs_confirmation' : (first.result === 'success' ? 'paid' : backup ? 'rerouted' : 'failed'), paid_from_account_id: needsConfirm ? null : first.result === 'success' ? primary.id : backup?.id ?? null, proposed_account_id: backup?.id ?? null, message: needsConfirm ? `This payment is over ${fmt(data.rules.confirm_above)}. Confirm to continue.` : backup ? `Payment ${first.result === 'success' ? 'completed' : `rerouted to ${backup.name}`}.` : first.result === 'success' ? 'Payment completed.' : 'No available account can cover this payment.', attempts: next && first.result !== 'success' ? [first, next] : [first], tips: backup && first.result !== 'success' ? [`${backup.name} has ${fmt(backup.balance)} available.`] : [] }
    }
    for (const attempt of result.attempts) { await new Promise(resolve => setTimeout(resolve, 520)); setAttempts(current => [...current, attempt]) }
    setPaymentState(result.message); setResultStatus(result.status); setTips(result.tips || [])
    if (result.status === 'needs_confirmation') { setBusy(false); return }
    if (result.status === 'failed') log(payee, `Not paid · ${result.message}`, 0, 'failed')
    if (result.paid_from_account_id) {
      const paidAccount = data.accounts.find(a => a.id === result.paid_from_account_id)
      setData(d => ({ ...d, accounts: d.accounts.map(a => a.id === result.paid_from_account_id ? { ...a, balance: a.balance - Number(amount) } : a), logs: [{ id: crypto.randomUUID(), title: payee, detail: `${paidAccount?.name} · ${paymentType === 'card' ? 'Card' : 'Direct debit'}${result.status === 'rerouted' ? ' · Rerouted' : ''}`, amount: -Number(amount), date: 'Just now', status: result.status }, ...d.logs] }))
      setPayee(''); setAmount('')
    }
    setBusy(false)
  }
  const scenario = (name: string, value: string, id: string, status: Account['status']) => {
    setPayee(name); setAmount(value); setSource(id); setPaymentType(name.toLowerCase().includes('rent') ? 'direct_debit' : 'card')
    setData(d => ({ ...d, accounts: d.accounts.map(a => a.id === id ? { ...a, status } : a) }))
    setTab('reroute'); setResultStatus(''); setTips([]); setPaymentState(`${name} scenario loaded — ${data.accounts.find(a => a.id === id)?.name} set to ${status}.`); setAttempts([])
  }
  const createItem = () => {
    if (!draftName.trim() || !Number(draftAmount)) return
    setData(d => ({ ...d, items: [{ id: crypto.randomUUID(), name: draftName, amount: Number(draftAmount), cycle: 'Monthly', date: draftDate, account: 'revolut', type: moneyTab, payment: 'Card', lastUsed: moneyTab === 'subscription' ? 'Nov 12' : undefined }, ...d.items] }))
    setDraftName(''); setDraftAmount(''); setShowForm(false); setNotice('Added to your money list.')
  }
  const removeItem = (item: MoneyItem) => {
    setData(d => ({ ...d, items: d.items.filter(i => i.id !== item.id) }))
    setNotice(item.type === 'subscription' ? `Cancelled ${item.name}. You could save ${fmt(item.amount * 12)} a year.` : `${item.name} removed.`)
    log(item.type === 'subscription' ? 'Subscription cancelled' : 'Money item removed', item.name, 0, 'action')
  }
  const accountName = (id: string) => data.accounts.find(a => a.id === id)?.name || 'Account'
  return (
    <main className="app-shell">
      <aside className="side-rail">
        <a className="brand" href="#home" aria-label="Synavo home"><span className="brand-mark"><span/><span/><span/></span><span>synavo</span></a>
        <div className="rail-label">YOUR MONEY</div>
        <nav className="side-nav" aria-label="Main navigation">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-link ${tab === item.id ? 'selected' : ''}`} onClick={() => setTab(item.id)}><Icon size={19}/>{item.label}{item.id === 'money' && <span className="nav-count">{data.items.length}</span>}</button> })}</nav>
        <div className="rail-bottom"><div className="safe-card"><ShieldCheck size={19}/><strong>Your money, protected</strong><p>Synavo never holds your money.</p></div><button className="reset-button" onClick={() => { setData(seed); setPaymentState(''); setResultStatus(''); setTips([]); setAttempts([]); localStorage.removeItem('synavo-demo-v1'); setNotice('Demo reset to its original state.') }}><RotateCcw size={15}/> Reset demo</button><p className="rail-fine">Demo – no real bank connections</p></div>
      </aside>
      <section className="main-area">
        <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><span/><span/><span/></span><span>synavo</span></div><div className="topbar-right"><span className="demo-pill"><i/> Demo mode</span><button className="icon-button" aria-label="Help"><CircleHelp size={19}/></button><div className="avatar">J</div></div></header>
        <div className="page-content">
          {tab === 'home' && <>
            <div className="welcome-row"><div><div className="eyebrow">{ready ? new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase() : '\u00a0'}</div><h1>Hey, Jamie <span className="wave">✳</span></h1><p className="subhead">Your money&apos;s looking good. Here&apos;s the latest.</p></div><button className="quiet-button" onClick={() => setTab('reroute')}><Send size={16}/> Make a payment</button></div>
            <div className="overview-grid"><section className="balance-card"><div className="balance-top"><span>Total across accounts</span><span className="live-status"><i/> ALL SYSTEMS GO</span></div><div className="big-balance">{fmt(data.accounts.reduce((s,a)=>s+a.balance,0))}</div><div className="balance-bottom"><span>Across {data.accounts.length} accounts</span><span className="balance-note"><ShieldCheck size={15}/> Protected by your banks</span></div><div className="balance-orbit orbit-one"/><div className="balance-orbit orbit-two"/></section>
              <section className="stat-card"><div className="stat-icon lilac"><CreditCard size={19}/></div><span className="stat-label">Monthly subscriptions</span><strong>{fmt(totalMonthly)}<small>/mo</small></strong><div className="stat-foot"><span className="mini-dot lilac-dot"/>{subscriptions.length} active subscriptions</div><div className="tiny-bars"><i style={{height:'36%'}}/><i style={{height:'54%'}}/><i style={{height:'44%'}}/><i style={{height:'70%'}}/><i style={{height:'53%'}}/><i style={{height:'84%'}}/><i style={{height:'65%'}}/><i style={{height:'100%'}}/></div></section>
              <section className="stat-card"><div className="stat-icon orange"><Bell size={19}/></div><span className="stat-label">Payments due soon</span><strong>{dueSoon}<small> this week</small></strong><div className="stat-foot"><span className="mini-dot orange-dot"/>{activeAlerts.length} things to keep an eye on</div><div className="due-mini">Next up <b>Electricity</b><span>Nov 21 · {fmt(48)}</span></div></section>
            </div>
            <div className="section-heading"><div><h2>Your accounts</h2><p>Tap the status to simulate an outage</p></div><button className="text-action" onClick={() => setTab('reroute')}>Manage rerouting <ArrowRight size={15}/></button></div>
            <div className="account-grid">{data.accounts.map((a, index) => <article className="account-card" key={a.id}><div className={`bank-logo bank-${a.id}`}>{a.name === 'Santander' ? 'S' : a.name === 'Revolut' ? 'R' : 'N'}</div><div className="account-info"><strong>{a.name}</strong><span>•••• {index === 0 ? '4821' : index === 1 ? '0936' : '7712'}</span></div><div className="account-balance">{fmt(a.balance)}</div><button className={`status-pill status-${a.status}`} onClick={() => changeStatus(a.id)} aria-label={`${a.name} status ${accountStatus[a.status]}. Click to change status`}><i/>{accountStatus[a.status]}<ChevronRight size={12}/></button></article>)}</div>
            <div className="home-columns"><section><div className="section-heading compact"><div><h2>Coming up</h2><p>Your next 7 days, at a glance</p></div><button className="text-action" onClick={() => { setTab('money'); setMoneyTab('bill') }}>See all <ArrowRight size={15}/></button></div><div className="coming-card">{data.items.filter(i => (i.type === 'bill' || i.type === 'subscription') && !i.paid).slice(0,3).map((i,index) => <div className="coming-row" key={i.id}><div className={`date-badge ${index === 0 ? 'date-hot' : ''}`}><b>{i.date.split(' ')[1]}</b><span>{i.date.split(' ')[0]}</span></div><div className="coming-info"><strong>{i.name}</strong><span>{i.payment} · {accountName(i.account)}</span></div><b>{fmt(i.amount)}</b></div>)}</div></section>
              <section><div className="section-heading compact"><div><h2>Heads up</h2><p>Small things, before they become big</p></div><span className="alert-number">{activeAlerts.length}</span></div><div className="alert-list">{activeAlerts.slice(0,3).map((a,index) => <div className="alert-row" key={`${a.title}-${index}`}><span className={`alert-symbol ${a.color}`}>{a.icon === 'owed' ? <HeartHandshake size={17}/> : a.icon === 'bill' ? <Landmark size={17}/> : <Sparkles size={17}/>}</span><div><strong>{a.title}</strong><p>{a.body}</p></div><ChevronRight size={15} className="muted-chevron"/></div>)}{activeAlerts.length === 0 && <div className="all-clear"><Check size={17}/> All caught up — nice one.</div>}</div></section></div>
            <div className="disclaimer"><ShieldCheck size={15}/><span>Demo – no real bank connections.</span><span className="disclaimer-sep">·</span><span>Synavo never holds your money.</span></div>
          </>}
          {tab === 'reroute' && <><div className="welcome-row page-title"><div><div className="eyebrow">PAYMENTS, WITH A PLAN B</div><h1>Reroute <span className="title-accent">when life happens.</span></h1><p className="subhead">If a bank hiccups, we’ll help your payment find another way.</p></div><div className="secure-tag"><ShieldCheck size={16}/> You stay in control</div></div>
            <div className="reroute-layout"><div className="reroute-main"><section className="panel payment-panel"><div className="panel-heading"><div><h2>Make a payment</h2><p>Try a demo payment — no money moves.</p></div><span className="demo-pill small-pill"><i/> SAFE DEMO</span></div><div className="form-field"><label htmlFor="payee">Who are you paying?</label><input id="payee" placeholder="e.g. University of Amsterdam" value={payee} onChange={e=>setPayee(e.target.value)}/></div><div className="form-two"><div className="form-field"><label htmlFor="amount">Amount</label><div className="amount-input"><span>€</span><input id="amount" type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></div></div><div className="form-field"><label htmlFor="pay-type">Payment method</label><select id="pay-type" value={paymentType} onChange={e=>setPaymentType(e.target.value as 'card'|'direct_debit')}><option value="card">Card payment</option><option value="direct_debit">Direct debit</option></select></div></div><div className="form-field"><label htmlFor="source-account">Pay from</label><select id="source-account" value={source} onChange={e=>setSource(e.target.value)}>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {fmt(a.balance)} · {accountStatus[a.status]}</option>)}</select></div>
                <button className="primary-button pay-button" disabled={busy} onClick={()=>runPayment()}>{busy ? <><span className="spinner"/> Finding a safe route…</> : <>Continue securely <ArrowRight size={17}/></>}</button>
                {paymentState && <div className={`payment-message ${resultStatus==='failed'||paymentState.includes('Add a')?'message-warn':''}`} role="status">{paymentState}{tips.length>0&&<ul className="payment-tips">{tips.map(t=><li key={t}>{t}</li>)}</ul>}</div>}
                {attempts.length>0 && <div className="timeline" aria-label="Payment attempts">{attempts.map((a,i)=><div className="timeline-row" key={`${a.account}-${i}`}><div className={`timeline-marker ${a.result==='success'?'marker-success':'marker-fail'}`}>{a.result==='success'?<Check size={13}/>:<X size={13}/>}</div><div><strong>{a.role}: {a.account}</strong><p>{a.reason}</p></div><span className={a.result==='success'?'success-word':'fail-word'}>{a.result}</span></div>)}</div>}
                {resultStatus==='needs_confirmation' && <button className="primary-button pay-button" onClick={()=>runPayment(true)} disabled={busy}>Approve and resend <ArrowRight size={17}/></button>}
              </section><section className="panel scenarios-panel"><div className="panel-heading"><div><h2>Try a what-if</h2><p>Tap a scenario to see rerouting in action</p></div><Sparkles size={20} className="scenario-spark"/></div><div className="scenario-list"><button className="scenario-button" onClick={()=>scenario('Tuition payment','950','santander','down')}><span className="scenario-icon purple"><Landmark size={17}/></span><span><b>Tuition payment</b><small>€950 · Santander outage</small></span><ArrowRight size={16}/></button><button className="scenario-button" onClick={()=>scenario('Concert ticket','65','revolut','blocked')}><span className="scenario-icon green"><CreditCard size={17}/></span><span><b>Concert ticket</b><small>€65 · Revolut blocked</small></span><ArrowRight size={16}/></button><button className="scenario-button" onClick={()=>scenario('Monthly rent','650','santander','down')}><span className="scenario-icon orange"><Wallet size={17}/></span><span><b>Monthly rent</b><small>€650 · Santander direct debit</small></span><ArrowRight size={16}/></button></div></section></div>
              <aside className="reroute-aside"><section className="panel backup-panel"><div className="panel-heading"><div><h2>Your backup order</h2><p>Who steps in if one bank is down</p></div><Ellipsis size={20}/></div><div className="backup-list">{[...data.accounts].sort((a,b)=>a.priority-b.priority).map((a,i)=><div className="backup-row" key={a.id}><span className="priority">{String(i+1).padStart(2,'0')}</span><div className={`bank-logo small-bank bank-${a.id}`}>{a.name[0]}</div><span className="backup-name">{a.name}</span><span className={`tiny-health health-${a.status}`}/></div>)}</div><p className="buffer-note"><ShieldCheck size={15}/> Keeps {fmt(data.rules.keep_buffer)} aside as a safety buffer</p></section><section className="panel rules-panel"><div className="panel-heading"><div><h2>Your rules</h2><p>Rerouting, your way</p></div></div><label className="rule-row"><span><b>Auto-reroute</b><small>Try a backup automatically</small></span><input type="checkbox" checked={data.rules.auto_reroute} onChange={e=>setData(d=>({...d,rules:{...d.rules,auto_reroute:e.target.checked}}))}/></label><div className="rule-row"><span><b>Ask me above</b><small>Confirm larger payments</small></span><select value={data.rules.confirm_above} onChange={e=>setData(d=>({...d,rules:{...d.rules,confirm_above:Number(e.target.value)}}))}><option value={100}>€100</option><option value={200}>€200</option><option value={500}>€500</option><option value={1000}>€1,000</option></select></div><div className="rule-row"><span><b>Keep a buffer</b><small>Leave this much untouched</small></span><select value={data.rules.keep_buffer} onChange={e=>setData(d=>({...d,rules:{...d.rules,keep_buffer:Number(e.target.value)}}))}><option value={0}>€0</option><option value={25}>€25</option><option value={50}>€50</option><option value={100}>€100</option></select></div></section><div className="outage-tip"><Sparkles size={17}/><p><b>Good to know</b><br/>We’ll never move money without your say-so. Every reroute is visible here.</p></div></aside></div><div className="disclaimer"><ShieldCheck size={15}/><span>Demo – no real bank connections.</span><span className="disclaimer-sep">·</span><span>Synavo never holds your money.</span></div></>}
          {tab === 'money' && <><div className="welcome-row page-title"><div><div className="eyebrow">THE LITTLE THINGS ADD UP</div><h1>Your money, <span className="title-accent">untangled.</span></h1><p className="subhead">Subscriptions, bills and the “I’ll pay you back”s.</p></div><button className="primary-button add-button" onClick={()=>setShowForm(v=>!v)}>{showForm?<X size={17}/>:<Plus size={17}/>} {showForm?'Close':'Add new'}</button></div>{showForm&&<section className="panel add-form"><div className="form-field"><label htmlFor="item-kind">Add to</label><select id="item-kind" value={moneyTab} onChange={e=>setMoneyTab(e.target.value as typeof moneyTab)}><option value="subscription">Subscription</option><option value="bill">Bill</option><option value="owed">Owed to you</option></select></div><div className="form-field"><label htmlFor="item-name">Name</label><input id="item-name" value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="e.g. Netflix"/></div><div className="form-field"><label htmlFor="item-amount">Amount (€)</label><input id="item-amount" type="number" min="0.01" step="0.01" value={draftAmount} onChange={e=>setDraftAmount(e.target.value)} placeholder="0.00"/></div><div className="form-field"><label htmlFor="item-date">Next date</label><input id="item-date" value={draftDate} onChange={e=>setDraftDate(e.target.value)}/></div><button className="primary-button" onClick={createItem}><Plus size={16}/> Add item</button></section>}{notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={()=>setNotice('')}><X size={15}/></button></div>}<div className="money-summary"><div><span>Subscriptions / month</span><b>{fmt(totalMonthly)}</b></div><div><span>Potential yearly savings</span><b className="saving-text">{fmt(subscriptions.filter(i=>i.lastUsed==='Sep 20'||i.trial).reduce((s,i)=>s+i.amount*12,0))}</b></div><div><span>People to nudge</span><b>{data.items.filter(i=>i.type==='owed'&&!i.paid).length}</b></div></div><div className="money-tabs" role="tablist" aria-label="Money categories">{(['subscription','bill','owed'] as const).map(key=><button role="tab" aria-selected={moneyTab===key} className={moneyTab===key?'active':''} onClick={()=>setMoneyTab(key)} key={key}>{key==='owed'?'Owed to you':key==='bill'?'Bills':'Subscriptions'} <span>{data.items.filter(i=>i.type===key).length}</span></button>)}</div><section className="money-list">{data.items.filter(i=>i.type===moneyTab).map(i=><article className="money-row" key={i.id}><div className={`money-icon ${i.type}`}>{i.type==='subscription'?<CreditCard size={18}/>:i.type==='bill'?<Landmark size={18}/>:<HeartHandshake size={18}/>}</div><div className="money-item-info"><b>{i.name}</b><span>{i.type==='owed'?i.payment:`${i.cycle} · ${i.payment} · ${accountName(i.account)}`}</span>{i.trial&&<em className="trial-chip">Trial ends {i.trial}</em>}{i.type==='subscription'&&i.lastUsed==='Sep 20'&&<em className="unused-chip">Unused 30+ days</em>}</div><div className="money-item-amount"><b>{fmt(i.amount)}</b><span>{i.date}{i.type==='subscription'?'/mo':''}</span></div>{i.type==='owed'&&!i.paid&&<button className="row-action reminder-action" onClick={()=>{const text=encodeURIComponent(`Hey ${i.name.split(' ')[0]}! Hope you're doing well. Just a friendly reminder about the ${fmt(i.amount)} for ${i.payment.toLowerCase()} whenever you get a chance. No rush!`);window.open(`https://wa.me/?text=${text}`,'_blank','noopener,noreferrer')}}><Send size={14}/> Nudge</button>}{i.type==='owed'&&<button className="row-action paid-action" onClick={()=>{setData(d=>({...d,items:d.items.map(x=>x.id===i.id?{...x,paid:true}:x)}));log('IOU paid',`${i.name} paid you back`,i.amount,'received')}}>{i.paid?<Check size={15}/>:<Check size={14}/>} {i.paid?'Paid':'Mark paid'}</button>}{i.type==='subscription'&&<button className="row-action cancel-action" onClick={()=>removeItem(i)}><Trash2 size={14}/> Cancel</button>}{i.type==='bill'&&<button className="row-action cancel-action" onClick={()=>removeItem(i)}><Trash2 size={14}/> Remove</button>}</article>)}{data.items.filter(i=>i.type===moneyTab).length===0&&<div className="empty-list">Nothing here yet. Add one to keep track.</div>}</section><div className="disclaimer"><ShieldCheck size={15}/><span>Demo – no real bank connections.</span><span className="disclaimer-sep">·</span><span>Synavo never holds your money.</span></div></>}
          {tab === 'activity' && <><div className="welcome-row page-title"><div><div className="eyebrow">A LITTLE PEACE OF MIND</div><h1>Every move, <span className="title-accent">accounted for.</span></h1><p className="subhead">Your payments and money moments, all in one place.</p></div><span className="activity-count">{data.logs.length} actions</span></div><div className="activity-toolbar"><span>RECENT ACTIVITY</span><button className="filter-button"><span className="filter-dot"/> All activity <ChevronRight size={14}/></button></div><section className="activity-list">{data.logs.map(l=><article className="activity-row" key={l.id}><div className={`activity-icon ${l.amount>0?'income-icon':'expense-icon'}`}>{l.amount>0?<ArrowDownLeft size={18}/>:l.status==='action'?<Check size={18}/>:<ArrowUpRight size={18}/>}</div><div className="activity-info"><b>{l.title}</b><span>{l.detail}</span><small>{l.date}</small></div><div className="activity-amount"><b className={l.amount>0?'income-amount':''}>{l.amount>0?'+':''}{fmt(l.amount)}</b><span className={`activity-status ${l.status==='rerouted'?'rerouted-status':l.status==='failed'?'failed-status':''}`}>{l.status==='rerouted'?'REROUTED':l.status==='received'?'RECEIVED':l.status==='action'?'UPDATED':l.status==='failed'?'FAILED':'COMPLETED'}</span></div></article>)}{data.logs.length===0&&<div className="empty-list">Your activity will show up here.</div>}</section><div className="disclaimer"><ShieldCheck size={15}/><span>Demo – no real bank connections.</span><span className="disclaimer-sep">·</span><span>Synavo never holds your money.</span></div></>}
        </div>
      </section>
      <nav className="bottom-nav" aria-label="Mobile navigation">{navItems.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setTab(item.id)} className={tab===item.id?'active':''}><Icon size={20}/><span>{item.label}</span></button>})}</nav>
    </main>
  )
}
