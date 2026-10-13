import { useEffect, useRef, useState } from "react";
import {
	addDays,
	addMonths,
	dateDifference,
	formatDate,
	getMonthGrid,
	monthLabel,
	todayKey,
} from "./utils/dateUtils";
import {
	getAllPeriodDates,
	getAutoConfirmedPeriod,
	getCurrentPrediction,
	getCycleDay,
	getLatestLog,
	getPredictions,
	getStatus,
	sortLogs,
} from "./utils/cycleUtils";
import {
	clearState,
	defaultState,
	loadState,
	saveState,
} from "./utils/storage";
import { getReminderCandidates } from "./utils/reminders";
import { sendReminderEmail, validEmail } from "./utils/emailService";
import {
	checkNotificationPermission,
	createBoundedNativeNotificationPlugin,
	getNativeNotificationPlugin,
	getNotificationPermission,
	isNativeNotificationPlatform,
	requestNotificationPermission,
	showBrowserNotification,
	showTestNotification,
	withNativeNotificationTimeout,
} from "./utils/notifications";
import { buildNativeReminderPlan, createNativeReminderReconciler } from "./utils/nativeReminderSchedule";
import { appConfig } from "./config/appConfig";

const symptoms = [
	["cramps", "Đau bụng"],
	["headache", "Đau đầu"],
	["backache", "Đau lưng"],
	["bloating", "Đầy hơi"],
	["fatigue", "Mệt mỏi"],
	["mood", "Tâm trạng"],
];
const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function App() {
	const [today, setToday] = useState(todayKey);
	const [state, setState] = useState(loadState);
	const [tab, setTab] = useState("home");
	const [month, setMonth] = useState(today.slice(0, 7));
	const [selectedDate, setSelectedDate] = useState(today);
	const [showPeriodForm, setShowPeriodForm] = useState(false);
	const [periodFormDate, setPeriodFormDate] = useState(null);
	const [showLogForm, setShowLogForm] = useState(false);
	const [editingLog, setEditingLog] = useState(null);
	const [toast, setToast] = useState("");
	const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);
	const [notificationBusy, setNotificationBusy] = useState(false);
	const [notificationMessage, setNotificationMessage] = useState("");
	const reminderInFlight = useRef(false);
	const notificationActionInFlight = useRef(false);
	const notificationActionVersion = useRef(0);
	const nativePlatform = isNativeNotificationPlatform();
	const nativeQueue = useRef(Promise.resolve());
	const nativeReconciler = useRef(null);
	const currentState = useRef(state);
	currentState.current = state;
	const nativeSchedule = useRef(state.nativeNotificationSchedule || []);

	const syncNativeReminders = () => {
		if (!nativePlatform) return Promise.resolve();
		const run = nativeQueue.current.then(async () => {
			const permission = await checkNotificationPermission();
			setNotificationPermission(permission);
			if (!nativeReconciler.current) {
				nativeReconciler.current = createNativeReminderReconciler(createBoundedNativeNotificationPlugin((await getNativeNotificationPlugin()).plugin));
			}
			const snapshot = currentState.current;
			const plan = permission === "granted" ? buildNativeReminderPlan({
				latest: getLatestLog(snapshot.periodLogs),
				cycleLength: snapshot.settings.cycleLength,
				periodLength: snapshot.settings.periodLength,
				preferences: snapshot.settings.reminders,
				history: snapshot.reminderHistory,
				previous: nativeSchedule.current,
			}) : [];
			const metadata = await nativeReconciler.current(plan, nativeSchedule.current);
			nativeSchedule.current = metadata;
			setState((current) => JSON.stringify(current.nativeNotificationSchedule) === JSON.stringify(metadata)
				? current : { ...current, nativeNotificationSchedule: metadata });
		});
		nativeQueue.current = run.catch(() => {});
		return run;
	};

	useEffect(() => {
		if (!nativePlatform) return;
		let disposed = false;
		const handles = [];
		const recordDelivery = (notification) => {
			const key = notification?.extra?.key;
			if (disposed || notification?.extra?.owner !== "day-red" || typeof key !== "string") return;
			setState((current) => ({
				...current,
				reminderHistory: [...new Set([...(current.reminderHistory || []), key])].slice(-500),
			}));
		};
		getNativeNotificationPlugin().then(async ({ plugin }) => {
			for (const [event, listener] of [
				["localNotificationReceived", recordDelivery],
				["localNotificationActionPerformed", (action) => recordDelivery(action.notification)],
			]) {
				await withNativeNotificationTimeout(async () => {
					const handle = await plugin.addListener(event, listener);
					if (disposed) await handle.remove();
					else handles.push(handle);
				}, `đăng ký ${event}`);
			}
		}).catch((error) => setNotificationMessage(error.message));
		return () => {
			disposed = true;
			handles.forEach((handle) => { handle.remove().catch(() => {}); });
		};
	}, [nativePlatform]);

	useEffect(() => {
		if (!nativePlatform) return;
		const reconcile = () => {
			if (document.visibilityState === "hidden") return;
			setToday(todayKey());
			syncNativeReminders().catch((error) => setToast(`Không thể cập nhật lịch nhắc: ${error.message}`));
		};
		reconcile();
		window.addEventListener("focus", reconcile);
		document.addEventListener("visibilitychange", reconcile);
		const timer = setInterval(reconcile, 60_000);
		return () => {
			window.removeEventListener("focus", reconcile);
			document.removeEventListener("visibilitychange", reconcile);
			clearInterval(timer);
		};
	}, [nativePlatform, state.settings, state.periodLogs, state.reminderHistory]);

	useEffect(() => {
		saveState(state);
	}, [state]);
	useEffect(() => {
		const timer = setInterval(() => {
			setToday((current) => {
				const next = todayKey();
				return current === next ? current : next;
			});
		}, 60_000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		if (toast) {
			const timer = setTimeout(() => setToast(""), 2600);
			return () => clearTimeout(timer);
		}
	}, [toast]);

	const latest = getLatestLog(state.periodLogs);
	const prediction = getCurrentPrediction(
		latest,
		state.settings.cycleLength,
		state.settings.periodLength,
	);
	const autoConfirmedPeriod = getAutoConfirmedPeriod(
		latest,
		state.settings.cycleLength,
		state.settings.periodLength,
		today,
	);
	const predictions = getPredictions(
		latest,
		state.settings.cycleLength,
		state.settings.periodLength,
		8,
	);
	const status = getStatus(
		latest,
		state.settings.cycleLength,
		state.settings.periodLength,
		today,
	);
	const cycleDay = getCycleDay(latest, today);
	useEffect(() => {
		if (!autoConfirmedPeriod) return;
		setState((current) => {
			const currentLatest = getLatestLog(current.periodLogs);
			const currentPeriod = getAutoConfirmedPeriod(
				currentLatest,
				current.settings.cycleLength,
				current.settings.periodLength,
				today,
			);
			if (
				!currentPeriod ||
				current.periodLogs.some(
					(log) => log.startDate === currentPeriod.startDate,
				)
			)
				return current;
			return {
				...current,
				periodLogs: [
					{
						id: `auto-${currentPeriod.startDate}`,
						startDate: currentPeriod.startDate,
						endDate: currentPeriod.endDate,
						periodLength: currentPeriod.periodLength,
						cycleLength: currentPeriod.cycleLength,
						symptoms: [],
						note: "",
					},
					...current.periodLogs,
				],
			};
		});
	}, [
		autoConfirmedPeriod?.startDate,
		autoConfirmedPeriod?.endDate,
		autoConfirmedPeriod?.cycleLength,
		autoConfirmedPeriod?.periodLength,
		today,
	]);
	const activeSettings = latest
		? {
				cycleLength: latest.cycleLength || state.settings.cycleLength,
				periodLength: latest.periodLength || state.settings.periodLength,
			}
		: state.settings;
	const dates = getAllPeriodDates(state.periodLogs, predictions);
	const hasData = state.periodLogs.length > 0;
	const reminderPreferences = state.settings.reminders || {};
	const reconcileReminders = async () => {
		if (reminderInFlight.current || !hasData) return;
		const candidates = getReminderCandidates({
			latest,
			cycleLength: state.settings.cycleLength,
			periodLength: state.settings.periodLength,
			today,
			now: new Date(),
			preferences: reminderPreferences,
			history: state.reminderHistory,
		});
		if (!candidates.length) return;
		reminderInFlight.current = true;
		try {
			const delivered = !nativePlatform && notificationPermission === "granted"
				? candidates
					.filter((candidate) => showBrowserNotification({ ...candidate, tag: candidate.key }))
					.map((candidate) => candidate.key)
				: [];
			const emailCandidate = candidates.find((candidate) => candidate.type === "period"
				&& candidate.daysUntil === reminderPreferences.leadDays
				&& reminderPreferences.emailEnabled
				&& reminderPreferences.emailAddress
				&& !(state.reminderHistory || []).includes(`email:period:${candidate.reminderDate}`));
			if (emailCandidate) {
				const result = await sendReminderEmail({
					toEmail: reminderPreferences.emailAddress,
					reminderType: "Kỳ kinh sắp tới",
					message: emailCandidate.body,
					reminderDate: formatDate(emailCandidate.reminderDate),
				});
				if (result.ok) delivered.push(`email:period:${emailCandidate.reminderDate}`);
			}
			if (delivered.length) {
				setState((current) => ({
					...current,
					reminderHistory: [...new Set([...(current.reminderHistory || []), ...delivered])].slice(-500),
				}));
			}
		} catch (error) {
			setToast(`Không thể gửi nhắc nhở: ${error.message}`);
		} finally {
			reminderInFlight.current = false;
		}
	};
	useEffect(() => {
		reconcileReminders();
		const onWake = () => reconcileReminders();
		window.addEventListener("focus", onWake);
		document.addEventListener("visibilitychange", onWake);
		const timer = setInterval(onWake, 60_000);
		return () => {
			window.removeEventListener("focus", onWake);
			document.removeEventListener("visibilitychange", onWake);
			clearInterval(timer);
		};
	}, [today, notificationPermission, state.reminderHistory, state.settings, latest?.startDate, hasData]);

	const updateSettings = (settings, profile = null) => {
		setState((current) => ({
			...current,
			profile: profile ? { name: profile.name.trim(), email: profile.email.trim() } : current.profile,
			settings: {
				...current.settings,
				...settings,
				reminders: profile
					? { ...current.settings.reminders, ...(settings.reminders || {}), emailAddress: profile.email }
					: settings.reminders || current.settings.reminders,
			},
		}));
		setToast("Đã lưu thay đổi");
	};
	const addPeriod = (form) => {
		const periodLength = Number(form.periodLength);
		const cycleLength = Number(form.cycleLength);
		if (dateDifference(todayKey(), form.startDate) > 0) {
			setToast("Không thể ghi ngày bắt đầu trong tương lai.");
			return;
		}
		const duplicate = state.periodLogs.some(
			(log) => log.startDate === form.startDate && log.id !== form.id,
		);
		if (duplicate) {
			setToast("Ngày này đã có trong lịch sử. Hãy chỉnh sửa bản ghi hiện có.");
			return;
		}
		const newLog = {
			id: form.id || uid(),
			startDate: form.startDate,
			endDate: addDays(form.startDate, periodLength - 1),
			periodLength,
			cycleLength,
			symptoms: form.symptoms || [],
			note: form.note || "",
		};
		const isNewLog = !form.id;
		const profile = form.profile
			? { name: form.profile.name.trim(), email: form.profile.email.trim() }
			: null;
		setState((current) => ({
			...current,
			profile: profile || current.profile,
			settings: isNewLog
				? {
					...current.settings,
					cycleLength,
					periodLength,
					reminders: profile
						? { ...current.settings.reminders, emailAddress: profile.email }
						: current.settings.reminders,
				}
				: current.settings,
			periodLogs: form.id
				? current.periodLogs.map((log) => (log.id === form.id ? newLog : log))
				: [newLog, ...current.periodLogs],
		}));
		setShowPeriodForm(false);
		setEditingLog(null);
		setPeriodFormDate(null);
		setToast(
			form.id
				? "Đã cập nhật ngày bắt đầu thực tế"
				: "Đã lưu ngày bắt đầu thực tế",
		);
	};
	const saveDailyLog = (form) => {
		setState((current) => ({
			...current,
			dailyLogs: [
				{ ...form, id: form.id || uid() },
				...current.dailyLogs.filter((log) => log.date !== form.date),
			],
		}));
		setShowLogForm(false);
		setEditingLog(null);
		setToast("Đã lưu nhật ký trong ngày");
	};
	const deletePeriod = (id) => {
		if (!window.confirm("Xóa bản ghi kỳ kinh này?")) return;
		setState((current) => ({
			...current,
			periodLogs: current.periodLogs.filter((log) => log.id !== id),
		}));
		setToast("Đã xóa bản ghi");
	};
	const resetAll = async () => {
		if (!window.confirm("Xóa toàn bộ dữ liệu theo dõi trên thiết bị này?"))
			return;
		try {
			if (nativePlatform) {
				await nativeQueue.current;
				if (!nativeReconciler.current) {
					nativeReconciler.current = createNativeReminderReconciler(createBoundedNativeNotificationPlugin((await getNativeNotificationPlugin()).plugin));
				}
				await nativeReconciler.current([], []);
				nativeSchedule.current = [];
			}
			clearState();
			currentState.current = defaultState;
			setState(defaultState);
			setTab("home");
			setToast("Đã xóa dữ liệu và lịch nhắc");
		} catch (error) {
			setToast(`Chưa xóa dữ liệu vì không thể hủy lịch nhắc: ${error.message}`);
		}
	};

	const openPeriodForm = (log = null, startDate = null) => {
		setEditingLog(log);
		setPeriodFormDate(startDate);
		setShowPeriodForm(true);
	};
	const openDateLog = (date) => {
		setSelectedDate(date);
		setEditingLog(state.dailyLogs.find((log) => log.date === date) || null);
		setShowLogForm(true);
	};
	const enableNotifications = async () => {
		if (notificationActionInFlight.current) return;
		notificationActionInFlight.current = true;
		const actionVersion = ++notificationActionVersion.current;
		setNotificationBusy(true);
		setNotificationMessage("Đang xin quyền thông báo...");
		try {
			const permission = await requestNotificationPermission();
			setNotificationPermission(permission);
			if (permission === "granted" && nativePlatform) {
				setNotificationMessage("Đã cấp quyền. Đang cập nhật lịch nhắc...");
				syncNativeReminders().then(() => {
					if (notificationActionVersion.current === actionVersion) setNotificationMessage("Đã cho phép thông báo và cập nhật lịch nhắc");
				}).catch((error) => {
					if (notificationActionVersion.current === actionVersion) setNotificationMessage(`Đã cấp quyền nhưng chưa cập nhật được lịch: ${error.message}`);
				});
				return;
			}
			setNotificationMessage(permission === "granted"
				? "Đã cho phép thông báo và cập nhật lịch nhắc"
				: permission === "denied"
					? nativePlatform
						? `Hãy bật thông báo cho ${appConfig.nativeAppName} trong Cài đặt iPhone → Thông báo.`
						: "Hãy bật lại thông báo trong cài đặt trình duyệt."
					: "Thiết bị chưa cho phép hoặc chưa hỗ trợ thông báo.");
		} catch (error) {
			setNotificationMessage(`Không thể bật thông báo: ${error.message}`);
		} finally {
			notificationActionInFlight.current = false;
			setNotificationBusy(false);
		}
	};
	const testNotification = async () => {
		if (notificationActionInFlight.current) return;
		notificationActionInFlight.current = true;
		++notificationActionVersion.current;
		setNotificationBusy(true);
		setNotificationMessage("Đang xin quyền để thử thông báo...");
		try {
			const permission = await requestNotificationPermission();
			setNotificationPermission(permission);
			if (permission === "granted") setNotificationMessage("Đang đặt lịch thông báo thử...");
			const shown = permission === "granted" && await showTestNotification();
			setNotificationMessage(shown
				? nativePlatform ? "Đã đặt lịch thử sau 5 giây. Hãy khóa màn hình để kiểm tra." : "Đã gửi thông báo thử"
				: nativePlatform ? `Hãy bật thông báo trong Cài đặt iPhone → Thông báo → ${appConfig.nativeAppName}.` : "Trình duyệt chưa cho phép hoặc không hỗ trợ thông báo.");
		} catch (error) {
			setNotificationMessage(`Không thể đặt lịch thử: ${error.message}`);
		} finally {
			notificationActionInFlight.current = false;
			setNotificationBusy(false);
		}
	};
	const testEmailReminder = async (recipient) => {
		const emailAddress = recipient || state.settings.reminders?.emailAddress;
		if (!emailAddress) {
			setToast("Hãy nhập email nhận trước khi thử gửi.");
			return;
		}
		setToast("Đang gửi email thử...");
		const result = await sendReminderEmail({
			toEmail: emailAddress,
			reminderType: "Email thử",
			message: "Đây là email thử từ ứng dụng Ngày Đỏ.",
			reminderDate: formatDate(today),
		});
		setToast(result.ok ? "Đã gửi email thử" : result.error);
	};

	return (
		<div className={`app-shell${nativePlatform ? " native-app" : ""}`}>
			<header className="topbar">
				<div className="brand">
					<span className="brand-mark">♥</span>
					<div>
						<strong>{appConfig.appName}</strong>
						<span>theo dõi thật nhẹ nhàng</span>
					</div>
				</div>
				<button
					className="icon-button"
					aria-label="Mở cài đặt"
					onClick={() => setTab("settings")}
				>
					⚙
				</button>
			</header>

			<main className="main-content">
				{!hasData && tab === "home" ? (
					<Onboarding onSave={addPeriod} profile={state.profile} showProfile={appConfig.isCommercial} />
				) : (
					<>
						{tab === "home" && (
							<Dashboard
								profile={state.profile}
								prediction={prediction}
								status={status}
								cycleDay={cycleDay}
								settings={activeSettings}
								onAdd={() => openPeriodForm()}
								onCalendar={() => setTab("calendar")}
								onLog={() => openDateLog(todayKey())}
							/>
						)}
						{tab === "calendar" && (
							<CalendarView
								month={month}
								setMonth={setMonth}
								selectedDate={selectedDate}
								setSelectedDate={setSelectedDate}
								dates={dates}
								dailyLogs={state.dailyLogs}
								periodLogs={state.periodLogs}
								onLog={openDateLog}
								onAddPeriod={(date) => openPeriodForm(null, date)}
								onEditPeriod={openPeriodForm}
							/>
						)}
						{tab === "history" && (
							<HistoryView
								logs={sortLogs(state.periodLogs)}
								onAdd={() => openPeriodForm()}
								onEdit={openPeriodForm}
								onDelete={deletePeriod}
							/>
						)}
						{tab === "settings" && (
							<SettingsView
								settings={state.settings}
								profile={state.profile}
								showProfile={appConfig.isCommercial}
								notificationPermission={notificationPermission}
								notificationBusy={notificationBusy}
								notificationMessage={notificationMessage}
									onEnableNotifications={enableNotifications}
									onTestNotification={testNotification}
									onTestEmail={testEmailReminder}
									onSave={updateSettings}
								onReset={resetAll}
								onBack={() => setTab("home")}
							/>
						)}
					</>
				)}
			</main>

			{hasData && (
				<nav className="bottom-nav" aria-label="Điều hướng chính">
					{[
						["home", "⌂", "Tổng quan"],
						["calendar", "▦", "Lịch"],
						["history", "◷", "Nhật ký"],
						["settings", "⚙", "Cài đặt"],
					].map(([id, icon, label]) => (
						<button
							key={id}
							className={tab === id ? "nav-item active" : "nav-item"}
							onClick={() => setTab(id)}
						>
							<span>{icon}</span>
							{label}
						</button>
					))}
				</nav>
			)}

			{showPeriodForm && (
				<Modal
					title={
						editingLog
							? "Chỉnh ngày bắt đầu thực tế"
							: "Ghi ngày bắt đầu thực tế"
					}
					onClose={() => {
						setShowPeriodForm(false);
						setEditingLog(null);
						setPeriodFormDate(null);
					}}
				>
					<PeriodForm
						initial={editingLog}
						defaultDate={periodFormDate}
						settings={state.settings}
						onSave={addPeriod}
					/>
				</Modal>
			)}
			{showLogForm && (
				<Modal
					title={`Nhật ký · ${formatDate(selectedDate, { day: "numeric", month: "long" })}`}
					onClose={() => {
						setShowLogForm(false);
						setEditingLog(null);
					}}
				>
					<DailyLogForm
						initial={editingLog}
						date={selectedDate}
						onSave={saveDailyLog}
					/>
				</Modal>
			)}
			{toast && (
				<output className="toast">
					{toast}
				</output>
			)}
			<footer className="site-footer">
				<span>
					Được tạo ra bằng tình yêu. <b aria-hidden="true">♥</b>
				</span>
				{appConfig.supportEmail && (
					<a href={`mailto:${appConfig.supportEmail}`}>
						© {appConfig.supportEmail}
					</a>
				)}
			</footer>
		</div>
	);
}

function ProfileFields({ profile, onChange, idPrefix }) {
	return (
		<>
			<div className="field">
				<label htmlFor={`${idPrefix}-name`}>Tên của bạn (không bắt buộc)</label>
				<input id={`${idPrefix}-name`} type="text" maxLength={80} value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} placeholder="Bạn muốn được gọi là gì?" autoComplete="name" />
			</div>
			<div className="field">
				<label htmlFor={`${idPrefix}-email`}>Email của bạn (không bắt buộc)</label>
				<input id={`${idPrefix}-email`} type="email" maxLength={254} value={profile.email} onChange={(event) => onChange({ ...profile, email: event.target.value })} placeholder="ban@example.com" autoComplete="email" />
				<small>Có thể bổ sung sau trong Cài đặt. Email chỉ nhận nhắc khi bạn bật tùy chọn gửi email.</small>
			</div>
		</>
	);
}

function Onboarding({ onSave, profile, showProfile }) {
	const [draft, setDraft] = useState(profile);
	const [profileError, setProfileError] = useState("");
	const save = (form) => {
		const email = draft.email.trim();
		if (showProfile && email && !validEmail(email)) {
			setProfileError("Email không hợp lệ. Bạn có thể sửa hoặc để trống.");
			return;
		}
		setProfileError("");
		onSave({ ...form, profile: showProfile ? { name: draft.name.trim(), email } : null });
	};
	return (
		<section className="onboarding page-enter" style={{ paddingBottom: 6 }}>
			<div className="eyebrow">CHÀO MỪNG ĐẾN VỚI NGÀY ĐỎ</div>
			<h1 style={{ paddingTop: 12 }}>
				Hiểu cơ thể
				<br />
				<em>yêu bản thân hơn.</em>
			</h1>
			<p className="hero-copy">
				Một nơi riêng tư để theo dõi chu kỳ và lắng nghe những thay đổi nhỏ mỗi
				ngày.
			</p>
			<div className="onboarding-card">
				<div className="mini-orbit">
					<span>♥</span>
				</div>
				<h2>Bắt đầu theo dõi</h2>
				<p>Nhập thông tin kỳ kinh gần nhất để xem những ngày sắp tới.</p>
				{showProfile && (
					<div className="profile-fields">
						<ProfileFields profile={draft} onChange={setDraft} idPrefix="onboarding-profile" />
						{profileError && <p className="form-error">{profileError}</p>}
					</div>
				)}
				<PeriodForm
					settings={{ cycleLength: 28, periodLength: 5 }}
					onSave={save}
				/>
			</div>
			<Disclaimer />
		</section>
	);
}

function Dashboard({
	profile,
	prediction,
	status,
	cycleDay,
	settings,
	onAdd,
	onCalendar,
	onLog,
}) {
	const daysUntil = prediction
		? Math.max(0, dateDifference(todayKey(), prediction.startDate))
		: 0;
	return (
		<section className="page-enter">
			<div className="section-heading">
				<div>
					<div className="eyebrow">
						TỔNG QUAN ·{" "}
						{formatDate(todayKey(), { day: "numeric", month: "long" })}
					</div>
					<h1>
						Xin chào{profile?.name ? <em style={{ marginLeft: 8 }}>{profile.name} nhé.</em> : <em style={{ marginLeft: 8 }}>{appConfig.greetingName ? `${appConfig.greetingName} nhé.` : "bạn nhé."}</em>}
					</h1>
				</div>
				<span
					className={`status-dot ${status.type}`}
					role="img"
					aria-label={status.label}
				></span>
			</div>
			<div className="status-card">
				<div className="status-card-top">
					<div>
						<span className="soft-label">TRẠNG THÁI HÔM NAY</span>
						<h2>{status.label}</h2>
						<p>
							{cycleDay > 0
								? `Ngày thứ ${cycleDay} của chu kỳ hiện tại`
								: "Hãy bắt đầu ghi nhận chu kỳ"}
						</p>
					</div>
					<div className="cycle-ring">
						<strong>{cycleDay > 0 ? cycleDay : "—"}</strong>
						<span>ngày</span>
					</div>
				</div>
				<div className="progress-track">
					<span
						style={{
							width: `${Math.min(100, Math.max(4, ((cycleDay || 0) / settings.cycleLength) * 100))}%`,
						}}
					></span>
				</div>
				<div className="progress-meta">
					<span>Ngày bắt đầu</span>
					<span>Chu kỳ {settings.cycleLength} ngày</span>
				</div>
			</div>
			<div className="prediction-card">
				<div className="prediction-icon">♡</div>
				<div className="prediction-content">
					<span className="soft-label">KỲ KINH TIẾP THEO · DỰ KIẾN</span>
					<h2>
						{prediction ? formatDate(prediction.startDate) : "Chưa có dữ liệu"}
					</h2>
					<p>
						{prediction
							? status.type === "overdue"
								? status.label
								: daysUntil === 0
									? "Có thể bắt đầu hôm nay"
									: `Còn ${daysUntil} ngày nữa`
							: "Ghi kỳ kinh đầu tiên để bắt đầu"}
					</p>
					<small>
						Nếu kỳ đã bắt đầu, hãy ghi ngày thực tế. Các kỳ đã ghi trước đó vẫn
						được giữ nguyên.
					</small>
				</div>
				<button
					className="arrow-button"
					onClick={onCalendar}
					aria-label="Mở lịch"
				>
					→
				</button>
			</div>
			<div className="quick-actions">
				<button onClick={onAdd}>
					<span>＋</span> Ghi ngày thực tế
				</button>
				<button onClick={onLog}>
					<span>✎</span> Nhật ký hôm nay
				</button>
			</div>
			<div className="insight-card">
				<span className="insight-star">♥</span>
				<div>
					<strong>Một lời nhắc nhỏ</strong>
					<p>
						Chu kỳ mỗi người mỗi khác. Hãy xem những dự đoán này như một gợi ý
						để hiểu cơ thể hơn, không phải một quy luật cố định.
					</p>
				</div>
			</div>
			<Disclaimer />
		</section>
	);
}

function CalendarView({
	month,
	setMonth,
	selectedDate,
	setSelectedDate,
	dates,
	dailyLogs,
	periodLogs,
	onLog,
	onAddPeriod,
	onEditPeriod,
}) {
	const grid = getMonthGrid(month);
	const selectedLog = dailyLogs.find((log) => log.date === selectedDate);
	const selectedPeriod = periodLogs.find(
		(log) => log.startDate === selectedDate,
	);
	const isFuture = dateDifference(todayKey(), selectedDate) > 0;
	const periodActionLabel = selectedPeriod
		? "Chỉnh ngày bắt đầu"
		: "Ghi ngày bắt đầu thực tế";
	return (
		<section className="page-enter">
			<div className="section-heading">
				<div>
					<div className="eyebrow">LỊCH CHU KỲ</div>
					<h1>
						Nhìn lại <em>nhịp riêng.</em>
					</h1>
				</div>
				<button
					type="button"
					className="today-button"
					onClick={() => {
						setMonth(todayKey().slice(0, 7));
						setSelectedDate(todayKey());
					}}
				>
					Hôm nay
				</button>
			</div>
			<div className="calendar-card">
				<div className="calendar-header">
					<button
						type="button"
						className="month-arrow"
						onClick={() => setMonth(addMonths(month, -1))}
						aria-label="Tháng trước"
					>
						‹
					</button>
					<h2>{monthLabel(month)}</h2>
					<button
						type="button"
						className="month-arrow"
						onClick={() => setMonth(addMonths(month, 1))}
						aria-label="Tháng sau"
					>
						›
					</button>
				</div>
				<div className="weekday-row">
					{weekdays.map((day) => (
						<span key={day}>{day}</span>
					))}
				</div>
				<div className="calendar-grid">
					{grid.map((date) => {
						const inMonth = date.startsWith(month);
						const confirmed = dates.confirmed.has(date);
						const predicted = dates.predicted.has(date) && !confirmed;
						const isToday = date === todayKey();
						return (
							<button
								type="button"
								key={date}
								className={`day-cell ${!inMonth ? "outside" : ""} ${confirmed ? "confirmed" : ""} ${predicted ? "predicted" : ""} ${isToday ? "today" : ""} ${date === selectedDate ? "selected" : ""}`}
								onClick={() => {
									setSelectedDate(date);
									if (!inMonth) setMonth(date.slice(0, 7));
								}}
								aria-label={`${formatDate(date)}${confirmed ? " - đã ghi kỳ kinh" : predicted ? " - ngày dự kiến" : ""}${isToday ? " - hôm nay" : ""}`}
								aria-pressed={date === selectedDate}
								aria-current={isToday ? "date" : undefined}
							>
								{new Date(`${date}T12:00:00`).getDate()}
								{confirmed && <i>●</i>}
								{predicted && <i>○</i>}
							</button>
						);
					})}
				</div>
				<div className="legend">
					<span>
						<i className="legend-dot confirmed-dot"></i>Ngày đèn đỏ
					</span>
					<span>
						<i className="legend-dot predicted-dot"></i>Dự kiến
					</span>
					<span>
						<i className="legend-ring"></i>Hôm nay
					</span>
				</div>
			</div>
			<div className="selected-day">
				<div>
					<span className="soft-label">NGÀY ĐANG CHỌN</span>
					<h2>{formatDate(selectedDate)}</h2>
					{selectedLog ? (
						<p>
							{selectedLog.flow
								? `Lượng kinh: ${selectedLog.flow}`
								: "Đã có nhật ký"}
							{selectedLog.note ? ` · ${selectedLog.note}` : ""}
						</p>
					) : (
						<p>Chưa có ghi chú cho ngày này</p>
					)}
				</div>
				<div className="selected-day-actions">
					<button
						type="button"
						className="primary-button compact"
						onClick={() =>
							selectedPeriod
								? onEditPeriod(selectedPeriod)
								: onAddPeriod(selectedDate)
						}
						disabled={isFuture && !selectedPeriod}
						aria-label={`${periodActionLabel} cho ngày đã chọn`}
						title={
							isFuture && !selectedPeriod
								? "Chỉ ghi ngày hôm nay hoặc ngày đã qua"
								: undefined
						}
					>
						{periodActionLabel}
					</button>
					<button
						type="button"
						className="secondary-button compact"
						onClick={() => onLog(selectedDate)}
					>
						{selectedLog ? "Chỉnh sửa nhật ký" : "Ghi nhật ký"}
					</button>
				</div>
			</div>
			{isFuture && !selectedPeriod && (
				<p className="calendar-action-hint">
					Chỉ có thể ghi ngày bắt đầu hôm nay hoặc ngày đã qua.
				</p>
			)}
			<p className="calendar-note">
				Các ngày màu hồng là dự đoán dựa trên chu kỳ đã nhập. Dự đoán có thể
				thay đổi theo từng tháng.
			</p>
		</section>
	);
}

function HistoryView({ logs, onAdd, onEdit, onDelete }) {
	return (
		<section className="page-enter">
			<div className="section-heading">
				<div>
					<div className="eyebrow">NHẬT KÝ CHU KỲ</div>
					<h1>
						Câu chuyện <em>của bạn.</em>
					</h1>
				</div>
				<button className="round-add" onClick={onAdd}>
					＋
				</button>
			</div>
			<button className="wide-action" onClick={onAdd}>
				＋ <span>Ghi ngày bắt đầu thực tế</span>
				<small>Thêm một kỳ riêng</small>
			</button>
			<div className="history-list">
				{logs.map((log, index) => (
					<article className="history-item" key={log.id}>
						<div className="history-marker">
							<span>
								{String(log.startDate.split("-")[2]).padStart(2, "0")}
							</span>
							<small>THÁNG {log.startDate.split("-")[1]}</small>
						</div>
						<div className="history-body">
							<div className="history-title">
								<div>
									<span className="soft-label">
										{index === 0 ? "GẦN NHẤT" : "ĐÃ GHI NHẬN"}
									</span>
									<h2>{formatDate(log.startDate)}</h2>
								</div>
								<span className="mini-pill">{log.periodLength || 5} ngày</span>
							</div>
							<p>
								{log.symptoms?.length
									? `${log.symptoms.length} triệu chứng được ghi`
									: "Chưa thêm triệu chứng"}
								{log.note ? ` · ${log.note}` : ""}
							</p>
							<div className="item-actions">
								<button onClick={() => onEdit(log)}>Chỉnh sửa</button>
								<button
									className="danger-text"
									onClick={() => onDelete(log.id)}
								>
									Xóa
								</button>
							</div>
						</div>
					</article>
				))}
				{!logs.length && (
					<div className="empty-state">
						<div>◌</div>
						<h2>Chưa có lịch sử</h2>
						<p>Những kỳ kinh bạn ghi nhận sẽ xuất hiện ở đây.</p>
					</div>
				)}
			</div>
		</section>
	);
}

function SettingsView({
	settings,
	profile,
	showProfile,
	notificationPermission,
	notificationBusy,
	notificationMessage,
	onEnableNotifications,
	onTestNotification,
		onSave,
	onReset,
	onBack,
}) {
	const [form, setForm] = useState({
		...settings,
		profile: { name: profile?.name || "", email: profile?.email || "" },
		reminders: {
			periodEnabled: true,
			waterEnabled: true,
			leadDays: 3,
			waterTimes: ["09:00", "13:00", "17:00"],
			emailEnabled: false,
			emailAddress: profile?.email || "",
			...(settings.reminders || {}),
		},
	});
	const reminders = form.reminders;
	const updateReminder = (key, value) =>
		setForm({ ...form, reminders: { ...reminders, [key]: value } });
	return (
		<section className="page-enter">
			<div className="settings-header">
				<button
					type="button"
					className="back-button"
					onClick={onBack}
					aria-label="Quay lại tổng quan"
				>
					←
				</button>
				<div>
					<div className="eyebrow">CÀI ĐẶT & RIÊNG TƯ</div>
					<h1>
						Thiết lập <em>nhịp của bạn.</em>
					</h1>
				</div>
			</div>
			<div className="settings-card">
				{showProfile && (
					<div className="profile-fields">
						<h2>Thông tin của bạn</h2>
						<ProfileFields profile={form.profile} onChange={(next) => setForm({ ...form, profile: next, profileError: "" })} idPrefix="settings-profile" />
						{form.profileError && <p className="form-error">{form.profileError}</p>}
					</div>
				)}
				<div className="field">
					<label htmlFor="settings-cycle">
						Mặc định độ dài chu kỳ cho kỳ mới
					</label>
					<div className="input-suffix">
						<input
							id="settings-cycle"
							type="number"
							min="15"
							max="60"
							value={form.cycleLength}
							onChange={(e) =>
								setForm({ ...form, cycleLength: e.target.value })
							}
						/>
						<span>ngày</span>
					</div>
					<small>Thay đổi này không sửa các kỳ đã ghi trước đó.</small>
				</div>
				<div className="field">
					<label htmlFor="settings-period">
						Mặc định số ngày hành kinh cho kỳ mới
					</label>
					<div className="input-suffix">
						<input
							id="settings-period"
							type="number"
							min="1"
							max="15"
							value={form.periodLength}
							onChange={(e) =>
								setForm({ ...form, periodLength: e.target.value })
							}
						/>
						<span>ngày</span>
					</div>
				</div>
				<div className="reminder-settings">
					<div className="field">
						<span className="field-label">Nhắc nhở trên thiết bị</span>
						<p className="settings-help">{isNativeNotificationPlatform()
								? "iPhone nhận lịch nhắc kể cả khi app không mở. Nhắc kỳ lúc 09:00; mở app để cập nhật dự đoán."
								: "Thông báo trình duyệt hoạt động tốt nhất khi bạn đang mở ứng dụng."}</p>
						<div className="notification-actions">
							<button type="button" className="secondary-button compact" disabled={notificationBusy} onClick={onEnableNotifications}>
								{notificationBusy ? "Đang xử lý..." : notificationPermission === "granted" ? "Đã cho phép thông báo" : "Cho phép thông báo"}
							</button>
							<button type="button" className="secondary-button compact" disabled={notificationBusy} onClick={onTestNotification}>
								Thử thông báo
							</button>
						</div>
						<small>Trạng thái: {{ granted: "Đã cho phép", denied: "Bị chặn", default: "Chưa cấp quyền", unsupported: "Không hỗ trợ" }[notificationPermission] || notificationPermission}</small>
						{notificationMessage && <output className="settings-help">{notificationMessage}</output>}
					</div>
					<label className="setting-toggle">
						<input type="checkbox" checked={reminders.periodEnabled} onChange={(e) => updateReminder("periodEnabled", e.target.checked)} />
						<span>Nhắc gần tới kỳ kinh</span>
					</label>
					<div className="field">
						<label htmlFor="reminder-lead">Báo trước</label>
						<div className="input-suffix">
							<input id="reminder-lead" type="number" min="1" max="7" value={reminders.leadDays} onChange={(e) => updateReminder("leadDays", Number(e.target.value))} />
							<span>ngày</span>
						</div>
					</div>
					<label className="setting-toggle">
						<input type="checkbox" checked={reminders.waterEnabled} onChange={(e) => updateReminder("waterEnabled", e.target.checked)} />
						<span>Nhắc uống đủ nước trong kỳ</span>
					</label>
					<div className="water-times">
						{reminders.waterTimes.map((time, index) => (
							<input key={time} aria-label={`Giờ nhắc uống nước ${index + 1}`} type="time" value={time} onChange={(e) => updateReminder("waterTimes", reminders.waterTimes.map((item, itemIndex) => itemIndex === index ? e.target.value : item))} />
						))}
					</div>
					<div className="email-reminder">
						<label className="setting-toggle">
							<input type="checkbox" checked={reminders.emailEnabled} onChange={(e) => updateReminder("emailEnabled", e.target.checked)} />
							<span>Gửi email nhắc trước kỳ kinh</span>
						</label>
						<div className="field">
							{!showProfile && <>
								<label htmlFor="reminder-email">Email nhận nhắc nhở</label>
								<input id="reminder-email" type="email" maxLength={254} value={form.profile.email} onChange={(e) => setForm({ ...form, profile: { ...form.profile, email: e.target.value } })} placeholder="ban@example.com" autoComplete="email" />
							</>}
							<small>{showProfile ? "Email nhận nhắc là email trong phần Thông tin của bạn. " : ""}Email chỉ được gửi khi bạn bật tùy chọn này và ứng dụng đang hoạt động.</small>
						</div>
					</div>
				</div>
				<button
					type="button"
					className="primary-button"
					onClick={() => {
						if (form.profile.email && !validEmail(form.profile.email.trim())) {
							setForm({ ...form, profileError: "Email không hợp lệ." });
							return;
						}
						onSave({
							cycleLength: Number.isInteger(Number(form.cycleLength))
								? Math.max(15, Math.min(60, Number(form.cycleLength)))
								: settings.cycleLength,
							periodLength: Number.isInteger(Number(form.periodLength))
								? Math.max(1, Math.min(15, Number(form.periodLength)))
								: settings.periodLength,
							reminders: {
								periodEnabled: Boolean(reminders.periodEnabled),
								waterEnabled: Boolean(reminders.waterEnabled),
								leadDays: Math.max(1, Math.min(7, Number(reminders.leadDays) || 3)),
								waterTimes: reminders.waterTimes,
								emailEnabled: Boolean(reminders.emailEnabled),
								emailAddress: reminders.emailAddress,
							},
						}, form.profile)
					}}
				>
					Lưu thay đổi
				</button>
			</div>
			<div className="privacy-card">
				<span>⌁</span>
				<div>
					<strong>Dữ liệu của bạn ở lại với bạn</strong>
					<p>
						Ngày Đỏ lưu dữ liệu ngay trên thiết bị này. Không cần tài khoản.
						Nếu bật email, địa chỉ và nội dung nhắc sẽ được gửi qua EmailJS.
					</p>
				</div>
			</div>
			<div className="danger-zone">
				<h2>Quản lý dữ liệu</h2>
				<p>Xóa tất cả kỳ kinh và nhật ký đã lưu trên thiết bị.</p>
				<button type="button" onClick={onReset}>Xóa toàn bộ dữ liệu</button>
			</div>
			<Disclaimer />
		</section>
	);
}

function PeriodForm({ initial, defaultDate, settings, onSave }) {
	const [form, setForm] = useState({
		startDate: initial?.startDate || defaultDate || todayKey(),
		cycleLength: initial?.cycleLength || settings.cycleLength,
		periodLength: initial?.periodLength || settings.periodLength,
		symptoms: initial?.symptoms || [],
		note: initial?.note || "",
		id: initial?.id,
	});
	const [error, setError] = useState("");
	const update = (key, value) => setForm({ ...form, [key]: value });
	const submit = (e) => {
		e.preventDefault();
		if (!form.startDate) return setError("Bạn hãy chọn ngày bắt đầu thực tế.");
		if (dateDifference(todayKey(), form.startDate) > 0)
			return setError("Không thể ghi ngày bắt đầu trong tương lai.");
		if (
			!Number.isInteger(Number(form.cycleLength)) ||
			Number(form.cycleLength) < 15 ||
			Number(form.cycleLength) > 60
		)
			return setError("Chu kỳ nên nằm trong khoảng 15–60 ngày.");
		if (
			!Number.isInteger(Number(form.periodLength)) ||
			Number(form.periodLength) < 1 ||
			Number(form.periodLength) > 15
		)
			return setError("Số ngày hành kinh nên nằm trong khoảng 1–15 ngày.");
		onSave(form);
	};
	return (
		<form className="form-stack" onSubmit={submit}>
			<div className="field">
				<label htmlFor="period-date">Ngày bắt đầu thực tế</label>
				<input
					id="period-date"
					type="date"
					value={form.startDate}
					max={todayKey()}
					onChange={(e) => update("startDate", e.target.value)}
				/>
				<small>
					Ngày này được lưu thành một kỳ riêng; các kỳ đã ghi trước đó vẫn được
					giữ nguyên.
				</small>
			</div>
			<div className="field">
				<span className="field-label">
					Độ dài chu kỳ dùng để dự đoán sau kỳ này
				</span>
				<div className="choice-row">
					{[22, 24, 28].map((value) => (
						<button
							type="button"
							key={value}
							className={
								Number(form.cycleLength) === value ? "choice active" : "choice"
							}
							onClick={() => update("cycleLength", value)}
						>
							{value}
							<small>ngày</small>
						</button>
					))}
					<button
						type="button"
						className={
							![22, 24, 28].includes(Number(form.cycleLength))
								? "choice active"
								: "choice"
						}
						onClick={() => update("cycleLength", 30)}
					>
						Khác<small>tùy chỉnh</small>
					</button>
				</div>
				{![22, 24, 28].includes(Number(form.cycleLength)) && (
					<input
						type="number"
						min="15"
						max="60"
						value={form.cycleLength}
						onChange={(e) => update("cycleLength", e.target.value)}
						placeholder="Ví dụ: 30"
					/>
				)}
			</div>
			<div className="field">
				<label htmlFor="period-length">Số ngày hành kinh thực tế</label>
				<div className="input-suffix">
					<input
						id="period-length"
						type="number"
						min="1"
						max="15"
						value={form.periodLength}
						onChange={(e) => update("periodLength", e.target.value)}
					/>
					<span>ngày</span>
				</div>
			</div>
			{error && <p className="form-error">{error}</p>}
			<button className="primary-button" type="submit">
				{initial ? "Lưu thay đổi" : "Lưu ngày bắt đầu thực tế"} <span>→</span>
			</button>
		</form>
	);
}

function DailyLogForm({ initial, date, onSave }) {
	const [form, setForm] = useState({
		id: initial?.id,
		date,
		flow: initial?.flow || "Vừa",
		symptoms: initial?.symptoms || [],
		note: initial?.note || "",
	});
	const toggle = (item) =>
		setForm({
			...form,
			symptoms: form.symptoms.includes(item)
				? form.symptoms.filter((value) => value !== item)
				: [...form.symptoms, item],
		});
	return (
		<form
			className="form-stack"
			onSubmit={(e) => {
				e.preventDefault();
				onSave(form);
			}}
		>
			<div className="field">
				<span className="field-label">Lượng kinh</span>
				<div className="flow-row">
					{["Không", "Ít", "Vừa", "Nhiều"].map((flow) => (
						<button
							type="button"
							key={flow}
							className={
								form.flow === flow ? "flow-choice active" : "flow-choice"
							}
							onClick={() => setForm({ ...form, flow })}
						>
							{flow}
						</button>
					))}
				</div>
			</div>
			<div className="field">
				<span className="field-label">Triệu chứng hôm nay</span>
				<div className="symptom-grid">
					{symptoms.map(([id, label]) => (
						<button
							type="button"
							key={id}
							className={
								form.symptoms.includes(id) ? "symptom active" : "symptom"
							}
							onClick={() => toggle(id)}
						>
							{form.symptoms.includes(id) ? "✓" : "+"} {label}
						</button>
					))}
				</div>
			</div>
			<div className="field">
				<label htmlFor="daily-note">Ghi chú</label>
				<textarea
					id="daily-note"
					rows="3"
					value={form.note}
					onChange={(e) => setForm({ ...form, note: e.target.value })}
					placeholder="Hôm nay bạn cảm thấy thế nào?"
				/>
			</div>
			<button className="primary-button" type="submit">
				Lưu nhật ký <span>→</span>
			</button>
		</form>
	);
}

function Modal({ title, onClose, children }) {
	return (
		<div className="modal-backdrop">
			<div className="modal" role="dialog" aria-modal="true" aria-label={title}>
				<div className="modal-header">
					<h2>{title}</h2>
					<button
						type="button"
						className="close-button"
						onClick={onClose}
						aria-label="Đóng"
					>
						×
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
function Disclaimer() {
	return (
		<div className="disclaimer">
			<span>i</span>
			<p>
				Dự đoán chỉ mang tính tham khảo, không dùng để tránh thai hoặc chẩn đoán
				y tế.
			</p>
		</div>
	);
}

export default App;
