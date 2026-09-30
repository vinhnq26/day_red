import { useEffect, useState } from 'react'
import { addDays, addMonths, dateDifference, formatDate, getMonthGrid, monthLabel, todayKey } from './utils/dateUtils'
import { getAllPeriodDates, getCurrentPrediction, getCycleDay, getLatestLog, getPredictions, getStatus, sortLogs } from './utils/cycleUtils'
import { clearState, defaultState, loadState, saveState } from './utils/storage'

const symptoms = [
  ['cramps', 'Đau bụng'], ['headache', 'Đau đầu'], ['backache', 'Đau lưng'],
  ['bloating', 'Đầy hơi'], ['fatigue', 'Mệt mỏi'], ['mood', 'Tâm trạng'],
]
const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

function App() {
  const [state, setState] = useState(loadState)
  const [tab, setTab] = useState('home')
  const [month, setMonth] = useState(todayKey().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [showPeriodForm, setShowPeriodForm] = useState(false)
  const [showLogForm, setShowLogForm] = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { saveState(state) }, [state])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) } }, [toast])

  const latest = getLatestLog(state.periodLogs)
  const prediction = getCurrentPrediction(latest, state.settings.cycleLength, state.settings.periodLength)
  const predictions = getPredictions(latest, state.settings.cycleLength, state.settings.periodLength, 8)
  const status = getStatus(latest, state.settings.cycleLength, state.settings.periodLength)
  const cycleDay = getCycleDay(latest)
  const dates = getAllPeriodDates(state.periodLogs, predictions)
  const hasData = state.periodLogs.length > 0

  const updateSettings = (settings) => setState((current) => ({ ...current, settings: { ...current.settings, ...settings } }))
  const addPeriod = (form) => {
    const periodLength = Number(form.periodLength)
    const newLog = { id: uid(), startDate: form.startDate, endDate: addDays(form.startDate, periodLength - 1), periodLength, symptoms: form.symptoms || [], note: form.note || '' }
    setState((current) => ({ ...current, settings: { ...current.settings, cycleLength: Number(form.cycleLength), periodLength }, periodLogs: [newLog, ...current.periodLogs.filter((log) => log.id !== form.id)] }))
    setShowPeriodForm(false); setEditingLog(null); setToast('Đã lưu kỳ kinh mới')
  }
  const saveDailyLog = (form) => {
    setState((current) => ({ ...current, dailyLogs: [{ ...form, id: form.id || uid() }, ...current.dailyLogs.filter((log) => log.date !== form.date)] }))
    setShowLogForm(false); setToast('Đã lưu nhật ký trong ngày')
  }
  const deletePeriod = (id) => {
    if (!window.confirm('Xóa bản ghi kỳ kinh này?')) return
    setState((current) => ({ ...current, periodLogs: current.periodLogs.filter((log) => log.id !== id) })); setToast('Đã xóa bản ghi')
  }
  const resetAll = () => {
    if (!window.confirm('Xóa toàn bộ dữ liệu theo dõi trên thiết bị này?')) return
    clearState(); setState(defaultState); setTab('home'); setToast('Đã xóa dữ liệu')
  }

  const openDateLog = (date) => { setSelectedDate(date); setEditingLog(state.dailyLogs.find((log) => log.date === date) || null); setShowLogForm(true) }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">♥</span><div><strong>Ngày Đỏ</strong><span>theo dõi thật nhẹ nhàng</span></div></div>
        <button className="icon-button" aria-label="Mở cài đặt" onClick={() => setTab('settings')}>⚙</button>
      </header>

      <main className="main-content">
        {!hasData && tab === 'home' ? <Onboarding onSave={addPeriod} /> : (
          <>
            {tab === 'home' && <Dashboard prediction={prediction} status={status} cycleDay={cycleDay} settings={state.settings} onAdd={() => setShowPeriodForm(true)} onCalendar={() => setTab('calendar')} onLog={() => openDateLog(todayKey())} />}
            {tab === 'calendar' && <CalendarView month={month} setMonth={setMonth} selectedDate={selectedDate} setSelectedDate={setSelectedDate} dates={dates} dailyLogs={state.dailyLogs} onLog={openDateLog} />}
            {tab === 'history' && <HistoryView logs={sortLogs(state.periodLogs)} onAdd={() => setShowPeriodForm(true)} onEdit={(log) => { setEditingLog(log); setShowPeriodForm(true) }} onDelete={deletePeriod} />}
            {tab === 'settings' && <SettingsView settings={state.settings} onSave={updateSettings} onReset={resetAll} onBack={() => setTab('home')} />}
          </>
        )}
      </main>

      {hasData && <nav className="bottom-nav" aria-label="Điều hướng chính">
        {[['home', '⌂', 'Tổng quan'], ['calendar', '▦', 'Lịch'], ['history', '◷', 'Nhật ký'], ['settings', '⚙', 'Cài đặt']].map(([id, icon, label]) => <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}
      </nav>}

      {showPeriodForm && <Modal title={editingLog ? 'Chỉnh sửa kỳ kinh' : 'Ghi kỳ kinh mới'} onClose={() => { setShowPeriodForm(false); setEditingLog(null) }}><PeriodForm initial={editingLog} settings={state.settings} onSave={addPeriod} /></Modal>}
      {showLogForm && <Modal title={`Nhật ký · ${formatDate(selectedDate, { day: 'numeric', month: 'long' })}`} onClose={() => setShowLogForm(false)}><DailyLogForm initial={editingLog} date={selectedDate} onSave={saveDailyLog} /></Modal>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <footer className="site-footer"><span>Được tạo ra bằng tình yêu. <b aria-hidden="true">♥</b></span><a href="mailto:Nguyenquocvinh813@gmail.com">© Nguyenquocvinh813@gmail.com</a></footer>
    </div>
  )
}

function Onboarding({ onSave }) {
  return (
			<section className="onboarding page-enter" style={{ paddingBottom: 6 }}>
				<div className="eyebrow">CHÀO MỪNG ĐẾN VỚI NGÀY ĐỎ</div>
				<h1 style={{ paddingTop: 12 }}>
					Hiểu cơ thể
					<br />
					<em>yêu bản thân hơn.</em>
				</h1>
				<p className="hero-copy">
					Một nơi riêng tư để theo dõi chu kỳ và lắng nghe những thay đổi nhỏ
					mỗi ngày.
				</p>
				<div className="onboarding-card">
					<div className="mini-orbit">
						<span>♥</span>
					</div>
					<h2>Bắt đầu theo dõi</h2>
					<p>Nhập thông tin kỳ kinh gần nhất để xem những ngày sắp tới.</p>
					<PeriodForm
						settings={{ cycleLength: 28, periodLength: 5 }}
						onSave={onSave}
					/>
				</div>
				<Disclaimer />
			</section>
		);
}

function Dashboard({ prediction, status, cycleDay, settings, onAdd, onCalendar, onLog }) {
  const daysUntil = prediction ? Math.max(0, dateDifference(todayKey(), prediction.startDate)) : 0
  return <section className="page-enter"><div className="section-heading"><div><div className="eyebrow">TỔNG QUAN · {formatDate(todayKey(), { day: 'numeric', month: 'long' })}</div><h1>Xin chào, <em>bé Nhii nhé.</em></h1></div><span className={`status-dot ${status.type}`} role="img" aria-label={status.label}></span></div><div className="status-card"><div className="status-card-top"><div><span className="soft-label">TRẠNG THÁI HÔM NAY</span><h2>{status.label}</h2><p>{cycleDay > 0 ? `Ngày thứ ${cycleDay} của chu kỳ hiện tại` : 'Hãy bắt đầu ghi nhận chu kỳ'}</p></div><div className="cycle-ring"><strong>{cycleDay > 0 ? cycleDay : '—'}</strong><span>ngày</span></div></div><div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(4, ((cycleDay || 0) / settings.cycleLength) * 100))}%` }}></span></div><div className="progress-meta"><span>Ngày bắt đầu</span><span>Chu kỳ {settings.cycleLength} ngày</span></div></div><div className="prediction-card"><div className="prediction-icon">♡</div><div className="prediction-content"><span className="soft-label">KỲ KINH TIẾP THEO · DỰ KIẾN</span><h2>{prediction ? formatDate(prediction.startDate) : 'Chưa có dữ liệu'}</h2><p>{prediction ? (status.type === 'overdue' ? status.label : daysUntil === 0 ? 'Có thể bắt đầu hôm nay' : `Còn ${daysUntil} ngày nữa`) : 'Ghi kỳ kinh đầu tiên để bắt đầu'}</p><small>Nếu đến sớm hoặc muộn, hãy cập nhật ngày thực tế để tính lại.</small></div><button className="arrow-button" onClick={onCalendar} aria-label="Mở lịch">→</button></div><div className="quick-actions"><button onClick={onAdd}><span>＋</span> Ghi kỳ kinh</button><button onClick={onLog}><span>✎</span> Nhật ký hôm nay</button></div><div className="insight-card"><span className="insight-star">♥</span><div><strong>Một lời nhắc nhỏ</strong><p>Chu kỳ mỗi người mỗi khác. Hãy xem những dự đoán này như một gợi ý để hiểu cơ thể hơn, không phải một quy luật cố định.</p></div></div><Disclaimer /></section>
}

function CalendarView({ month, setMonth, selectedDate, setSelectedDate, dates, dailyLogs, onLog }) {
  const grid = getMonthGrid(month); const selectedLog = dailyLogs.find((log) => log.date === selectedDate)
  return <section className="page-enter"><div className="section-heading"><div><div className="eyebrow">LỊCH CHU KỲ</div><h1>Nhìn lại <em>nhịp riêng.</em></h1></div><button className="today-button" onClick={() => { setMonth(todayKey().slice(0, 7)); setSelectedDate(todayKey()) }}>Hôm nay</button></div><div className="calendar-card"><div className="calendar-header"><button className="month-arrow" onClick={() => setMonth(addMonths(month, -1))}>‹</button><h2>{monthLabel(month)}</h2><button className="month-arrow" onClick={() => setMonth(addMonths(month, 1))}>›</button></div><div className="weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{grid.map((date) => { const inMonth = date.startsWith(month); const confirmed = dates.confirmed.has(date); const predicted = dates.predicted.has(date) && !confirmed; const isToday = date === todayKey(); return <button key={date} className={`day-cell ${!inMonth ? 'outside' : ''} ${confirmed ? 'confirmed' : ''} ${predicted ? 'predicted' : ''} ${isToday ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(date)} aria-label={`${date}${confirmed ? ' - đã ghi kỳ kinh' : predicted ? ' - ngày dự kiến' : ''}`}>{new Date(`${date}T12:00:00`).getDate()}{confirmed && <i>●</i>}{predicted && <i>○</i>}</button> })}</div><div className="legend"><span><i className="legend-dot confirmed-dot"></i>Đã ghi</span><span><i className="legend-dot predicted-dot"></i>Dự kiến</span><span><i className="legend-ring"></i>Hôm nay</span></div></div><div className="selected-day"><div><span className="soft-label">NGÀY ĐANG CHỌN</span><h2>{formatDate(selectedDate)}</h2>{selectedLog ? <p>{selectedLog.flow ? `Lượng kinh: ${selectedLog.flow}` : 'Đã có nhật ký'}{selectedLog.note ? ` · ${selectedLog.note}` : ''}</p> : <p>Chưa có ghi chú cho ngày này</p>}</div><button className="primary-button compact" onClick={() => onLog(selectedDate)}>{selectedLog ? 'Chỉnh sửa' : 'Ghi nhật ký'}</button></div><p className="calendar-note">Các ngày màu hồng là dự đoán dựa trên chu kỳ đã nhập. Dự đoán có thể thay đổi theo từng tháng.</p></section>
}

function HistoryView({ logs, onAdd, onEdit, onDelete }) { return <section className="page-enter"><div className="section-heading"><div><div className="eyebrow">NHẬT KÝ CHU KỲ</div><h1>Câu chuyện <em>của bạn.</em></h1></div><button className="round-add" onClick={onAdd}>＋</button></div><button className="wide-action" onClick={onAdd}>＋ <span>Thêm một kỳ kinh</span><small>Ghi nhận ngày bắt đầu mới</small></button><div className="history-list">{logs.map((log, index) => <article className="history-item" key={log.id}><div className="history-marker"><span>{String(log.startDate.split('-')[2]).padStart(2, '0')}</span><small>THÁNG {log.startDate.split('-')[1]}</small></div><div className="history-body"><div className="history-title"><div><span className="soft-label">{index === 0 ? 'GẦN NHẤT' : 'ĐÃ GHI NHẬN'}</span><h2>{formatDate(log.startDate)}</h2></div><span className="mini-pill">{log.periodLength || 5} ngày</span></div><p>{log.symptoms?.length ? `${log.symptoms.length} triệu chứng được ghi` : 'Chưa thêm triệu chứng'}{log.note ? ` · ${log.note}` : ''}</p><div className="item-actions"><button onClick={() => onEdit(log)}>Chỉnh sửa</button><button className="danger-text" onClick={() => onDelete(log.id)}>Xóa</button></div></div></article>)}{!logs.length && <div className="empty-state"><div>◌</div><h2>Chưa có lịch sử</h2><p>Những kỳ kinh bạn ghi nhận sẽ xuất hiện ở đây.</p></div>}</div></section> }

function SettingsView({ settings, onSave, onReset, onBack }) { const [form, setForm] = useState(settings); return <section className="page-enter"><div className="settings-header"><button className="back-button" onClick={onBack} aria-label="Quay lại tổng quan">←</button><div><div className="eyebrow">CÀI ĐẶT & RIÊNG TƯ</div><h1>Thiết lập <em>nhịp của bạn.</em></h1></div></div><div className="settings-card"><div className="field"><label htmlFor="settings-cycle">Độ dài chu kỳ trung bình</label><div className="input-suffix"><input id="settings-cycle" type="number" min="15" max="60" value={form.cycleLength} onChange={(e) => setForm({ ...form, cycleLength: e.target.value })} /><span>ngày</span></div><small>Khoảng thường gặp: 21–35 ngày</small></div><div className="field"><label htmlFor="settings-period">Số ngày hành kinh</label><div className="input-suffix"><input id="settings-period" type="number" min="1" max="15" value={form.periodLength} onChange={(e) => setForm({ ...form, periodLength: e.target.value })} /><span>ngày</span></div></div><button className="primary-button" onClick={() => onSave({ cycleLength: Math.max(15, Math.min(60, Number(form.cycleLength))), periodLength: Math.max(1, Math.min(15, Number(form.periodLength))) })}>Lưu thay đổi</button></div><div className="privacy-card"><span>⌁</span><div><strong>Dữ liệu của bạn ở lại với bạn</strong><p>Ngày Đỏ lưu dữ liệu ngay trên thiết bị này. Không cần tài khoản, không gửi thông tin cá nhân lên máy chủ.</p></div></div><div className="danger-zone"><h2>Quản lý dữ liệu</h2><p>Xóa tất cả kỳ kinh và nhật ký đã lưu trên thiết bị.</p><button onClick={onReset}>Xóa toàn bộ dữ liệu</button></div><Disclaimer /></section> }

function PeriodForm({ initial, settings, onSave }) { const [form, setForm] = useState({ startDate: initial?.startDate || todayKey(), cycleLength: initial?.cycleLength || settings.cycleLength, periodLength: initial?.periodLength || settings.periodLength, symptoms: initial?.symptoms || [], note: initial?.note || '', id: initial?.id }); const [error, setError] = useState(''); const update = (key, value) => setForm({ ...form, [key]: value }); const submit = (e) => { e.preventDefault(); if (!form.startDate) return setError('Bạn hãy chọn ngày bắt đầu.'); if (Number(form.cycleLength) < 15 || Number(form.cycleLength) > 60) return setError('Chu kỳ nên nằm trong khoảng 15–60 ngày.'); if (Number(form.periodLength) < 1 || Number(form.periodLength) > 15) return setError('Số ngày hành kinh nên nằm trong khoảng 1–15 ngày.'); onSave(form) }; return <form className="form-stack" onSubmit={submit}><div className="field"><label htmlFor="period-date">Ngày bắt đầu kỳ kinh gần nhất</label><input id="period-date" type="date" value={form.startDate} max={todayKey()} onChange={(e) => update('startDate', e.target.value)} /></div><div className="field"><span className="field-label">Độ dài chu kỳ</span><div className="choice-row">{[22, 24, 28].map((value) => <button type="button" key={value} className={Number(form.cycleLength) === value ? 'choice active' : 'choice'} onClick={() => update('cycleLength', value)}>{value}<small>ngày</small></button>)}<button type="button" className={![22, 24, 28].includes(Number(form.cycleLength)) ? 'choice active' : 'choice'} onClick={() => update('cycleLength', 30)}>Khác<small>tùy chỉnh</small></button></div>{![22, 24, 28].includes(Number(form.cycleLength)) && <input type="number" min="15" max="60" value={form.cycleLength} onChange={(e) => update('cycleLength', e.target.value)} placeholder="Ví dụ: 30" />}</div><div className="field"><label htmlFor="period-length">Số ngày hành kinh</label><div className="input-suffix"><input id="period-length" type="number" min="1" max="15" value={form.periodLength} onChange={(e) => update('periodLength', e.target.value)} /><span>ngày</span></div></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit">{initial ? 'Lưu thay đổi' : 'Bắt đầu theo dõi'} <span>→</span></button></form> }

function DailyLogForm({ initial, date, onSave }) { const [form, setForm] = useState({ id: initial?.id, date, flow: initial?.flow || 'Vừa', symptoms: initial?.symptoms || [], note: initial?.note || '' }); const toggle = (item) => setForm({ ...form, symptoms: form.symptoms.includes(item) ? form.symptoms.filter((value) => value !== item) : [...form.symptoms, item] }); return <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSave(form) }}><div className="field"><span className="field-label">Lượng kinh</span><div className="flow-row">{['Không', 'Ít', 'Vừa', 'Nhiều'].map((flow) => <button type="button" key={flow} className={form.flow === flow ? 'flow-choice active' : 'flow-choice'} onClick={() => setForm({ ...form, flow })}>{flow}</button>)}</div></div><div className="field"><span className="field-label">Triệu chứng hôm nay</span><div className="symptom-grid">{symptoms.map(([id, label]) => <button type="button" key={id} className={form.symptoms.includes(id) ? 'symptom active' : 'symptom'} onClick={() => toggle(id)}>{form.symptoms.includes(id) ? '✓' : '+'} {label}</button>)}</div></div><div className="field"><label htmlFor="daily-note">Ghi chú</label><textarea id="daily-note" rows="3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Hôm nay bạn cảm thấy thế nào?" /></div><button className="primary-button" type="submit">Lưu nhật ký <span>→</span></button></form> }

function Modal({ title, onClose, children }) { return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button type="button" className="close-button" onClick={onClose} aria-label="Đóng">×</button></div>{children}</div></div> }
function Disclaimer() { return <div className="disclaimer"><span>i</span><p>Dự đoán chỉ mang tính tham khảo, không dùng để tránh thai hoặc chẩn đoán y tế.</p></div> }

export default App
