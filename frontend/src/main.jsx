import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowRight, Bell, Check, Clock3, Heart, Leaf, LogOut, MapPin, PackagePlus, ShieldCheck, Sparkles, Trash2, Utensils, X, Activity, CalendarDays, ChevronRight, CircleAlert, LoaderCircle, Route, Users, Warehouse, Menu, Eye, EyeOff, TrendingUp, Award, Zap, Target } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { CircleMarker, MapContainer, TileLayer, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const HERO_IMG = 'https://images.pexels.com/photos/6995260/pexels-photo-6995260.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
const AUTH_IMG = 'https://images.pexels.com/photos/4262007/pexels-photo-4262007.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

const api = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
const normalizeAccount = account => ({ ...account, role: String(account?.role || '').toLowerCase() });
const statusClass = value => `status ${String(value || '').toLowerCase().replace('_', '-')}`;
const emptyForm = { foodName: '', foodType: 'Cooked meal', quantity: '', unit: 'meals', expiryTime: '', pickupLocation: '', description: '' };
const formatExpiry = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };

const timelineStatuses = ['AVAILABLE', 'ACCEPTED', 'PICKUP_SCHEDULED', 'PICKUP_IN_PROGRESS', 'COLLECTED', 'COMPLETED'];
const statusLabel = value => String(value || '').replaceAll('_', ' ');
const statusIndex = value => timelineStatuses.indexOf(value);

/* ── Hooks ── */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function useCountUp(target, inView, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView || !target) return;
    let raf; const start = performance.now();
    const tick = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, inView, duration]);
  return value;
}

/* ── Map ── */
function MapView({ coordinates, address }) {
  if (!coordinates?.latitude || !coordinates?.longitude) return null;
  return <div className="map-wrap"><MapContainer center={[coordinates.latitude, coordinates.longitude]} zoom={13} scrollWheelZoom={false}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><CircleMarker center={[coordinates.latitude, coordinates.longitude]} radius={10} pathOptions={{ color: '#059669', fillColor: '#10B981', fillOpacity: 0.8 }}><Popup>{address}</Popup></CircleMarker></MapContainer></div>;
}

/* ── Shared UI ── */
function LoadingState({ label = 'Loading your workspace' }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} /> {label}</div>;
}

function EmptyState({ icon: Icon = PackagePlus, title, message, action, onAction }) {
  return <div className="empty-state"><Icon size={28} /><strong>{title}</strong><p>{message}</p>{action && <button className="btn btn-primary btn-sm" onClick={onAction}>{action} <ArrowRight size={15} /></button>}</div>;
}

function WorkspaceError({ message }) {
  return <section className="workspace"><div className="verification-state"><div className="verification-icon"><CircleAlert size={30} /></div><p className="eyebrow">Workspace unavailable</p><h2>{message}</h2><p>Refresh the page or sign in again to retry the authenticated dashboard request.</p></div></section>;
}

function DonorVerificationState({ status }) {
  const rejected = status === 'REJECTED';
  return <section className="workspace"><div className="verification-state"><div className="verification-icon"><ShieldCheck size={30} /></div><p className="eyebrow">Donor verification</p><h2>{rejected ? 'Your donor account has not been approved.' : 'Your account is waiting for Admin verification.'}</h2><p>{rejected ? 'Donation creation is disabled until an administrator approves your account.' : 'You will receive a notification when your account has been reviewed. Donation creation is disabled while verification is pending.'}</p><span className={statusClass(status)}>{statusLabel(status)}</span></div></section>;
}

function StatusTimeline({ status }) {
  const current = statusIndex(status);
  return <div className="status-timeline" aria-label={`Donation status: ${statusLabel(status)}`}>{timelineStatuses.map((item, index) => <div className={`timeline-step ${index <= current ? 'complete' : ''} ${item === status ? 'current' : ''}`} key={item}><span>{index < current ? <Check size={13} /> : index + 1}</span><small>{statusLabel(item)}</small></div>)}</div>;
}

function PickupTimeline({ status }) {
  const steps = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COLLECTED', 'COMPLETED'];
  const current = steps.indexOf(status);
  return <div className="pickup-timeline">{steps.map((item, index) => <span className={index <= current ? 'complete' : ''} key={item}>{index < current ? <Check size={12} /> : index + 1} {statusLabel(item)}</span>)}</div>;
}

function MiniActivityChart({ points = [], label = 'Activity' }) {
  const values = points.map(point => Number(point.count ?? point.donations ?? point.quantity ?? 0));
  const max = Math.max(...values, 1);
  const polyline = values.length ? values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${100 - (value / max) * 82 - 9}`).join(' ') : '0,91 100,91';
  return <div className="activity-chart"><div className="chart-heading"><span>{label}</span><Activity size={17} /></div>{values.length ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} chart`}><defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity="0.3" /><stop offset="100%" stopColor="#10B981" stopOpacity="0" /></linearGradient></defs><polyline points={`${polyline} 100,100 0,100`} className="chart-area" /><polyline points={polyline} className="chart-line" /></svg> : <div className="chart-empty">No activity in this period yet.</div>}</div>;
}

function Metric({ icon: Icon, value, label, color = 'emerald' }) {
  return <div className="metric-card fade-up"><div className={`metric-icon ${color}`}><Icon size={18} /></div><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong><span>{label}</span></div>;
}

function SkeletonCard() { return <div className="skeleton skeleton-card" />; }
function SkeletonRow() { return <div className="skeleton skeleton-row" />; }

/* ── Impact Counters (animated) ── */
function ImpactCounters({ impact }) {
  const [ref, inView] = useInView();
  const metrics = [
    { value: impact?.foodPortionsRescued || 0, label: 'Food portions rescued' },
    { value: impact?.completedDonations || 0, label: 'Donations completed' },
    { value: impact?.verifiedDonors || 0, label: 'Verified donors' },
    { value: impact?.verifiedNGOs || 0, label: 'Verified NGOs' },
  ];
  return <section className="impact-strip" id="impact" ref={ref}><div className="impact-intro"><p className="eyebrow"><Heart size={16} /> FeedingMe impact</p><h2>Good food, kept in motion.</h2></div>{metrics.map(m => <ImpactCounter key={m.label} target={m.value} inView={inView} label={m.label} />)}</section>;
}
function ImpactCounter({ target, inView, label }) {
  const v = useCountUp(target, inView);
  return <div className="impact-number"><strong>{v.toLocaleString()}</strong><span>{label}</span></div>;
}

/* ── Landing sections ── */
function RescueFlow() {
  return <section className="section"><div className="section-head"><div><p className="eyebrow"><Route size={16} /> Every donation counts</p><h2>One extra tray.<br /><em>A better next step.</em></h2></div><p className="section-lede">FeedingMe makes the handoff visible, so surplus food can move with purpose instead of quietly becoming waste.</p></div><div className="flow-track">{[['01', 'Donor', Heart], ['02', 'Food posted', PackagePlus], ['03', 'NGO matched', ShieldCheck], ['04', 'Pickup', MapPin], ['05', 'Food rescued', Check]].map(([number, label, Icon], i) => <div className={`flow-node fade-up stagger-${i + 1}`} key={label}><span className="flow-num">{number}</span><div className="flow-body"><Icon size={20} /><strong>{label}</strong></div></div>)}</div></section>;
}

function WhyFeedingMe() {
  return <section className="section"><div className="why-section"><div><p className="eyebrow"><Sparkles size={16} /> Why FeedingMe</p><h2>A trusted local route<br />for good food.</h2></div><div className="why-grid"><article className="why-card fade-up stagger-1"><Trash2 size={21} /><h3>Reduce food waste</h3><p>Rescue safe surplus before it leaves the table.</p></article><article className="why-card fade-up stagger-2"><Heart size={21} /><h3>Support communities</h3><p>Connect food with organisations serving people in need.</p></article><article className="why-card fade-up stagger-3"><ShieldCheck size={21} /><h3>Verified network</h3><p>Admin checks help donors and NGOs act with confidence.</p></article><article className="why-card fade-up stagger-4"><MapPin size={21} /><h3>Local impact</h3><p>Keep pickup practical, nearby, and accountable.</p></article></div></div></section>;
}

/* ── Donation Table (history list) ── */
function DonationTable({ donations, onView, emptyAction }) {
  if (!donations.length) return <EmptyState icon={PackagePlus} title="No donations yet." message="Your first donation can help turn surplus food into a meal." action={emptyAction} />;
  return <div className="history-list">{donations.map((donation, i) => <article className={`history-row status-${donation.status.toLowerCase().replace('_', '-')} fade-up stagger-${Math.min(i + 1, 8)}`} key={donation.id}><div className="history-image">{(donation.image?.url || donation.imageUrl) ? <img src={donation.image?.url || donation.imageUrl} alt="" /> : <Utensils size={20} />}</div><div className="history-main"><strong>{donation.foodName}</strong><span>{donation.quantity} {donation.unit} · {formatExpiry(donation.createdAt)}</span><small>{donation.acceptedByName || donation.pickupLocation || 'Pickup location pending'}</small></div><span className={statusClass(donation.status)}>{statusLabel(donation.status)}</span><button className="row-action" onClick={() => onView(donation)} aria-label={`View ${donation.foodName}`}><ChevronRight size={18} /></button></article>)}</div>;
}

/* ── Role Workspace ── */
function RoleWorkspace({ user, stats, donorHistory, ngoProfile, ngoPickups, availableDonations, adminStats, adminAnalytics, adminNGOs, adminDonors, adminUsers, adminDonations, adminPickups, loading, workspaceError, loadingIssues, onDonate, onAccept, onSchedule, onView, onRefresh, onVerify, onViewVerification }) {
  if (loading) return <section className="workspace"><LoadingState /></section>;
  if (workspaceError) return <WorkspaceError message={workspaceError} />;
  if (user.role === 'ngo' && ngoProfile && ngoProfile.verificationStatus !== 'VERIFIED') {
    const rejected = ngoProfile.verificationStatus === 'REJECTED';
    return <section className="workspace"><div className="verification-state"><div className="verification-icon"><ShieldCheck size={30} /></div><p className="eyebrow">Partner verification</p><h2>{rejected ? 'Your NGO account has not been approved.' : 'Your NGO verification is currently under review.'}</h2><p>{rejected ? 'Donation acceptance and pickup management are disabled until your organisation is approved.' : 'We will notify you as soon as your organisation is approved. Verified partners can accept donations and coordinate pickups.'}</p><span className={statusClass(ngoProfile.verificationStatus)}>{statusLabel(ngoProfile.verificationStatus)}</span></div></section>;
  }
  if (user.role === 'donor' && user.verificationStatus !== 'APPROVED') return <DonorVerificationState status={user.verificationStatus || 'PENDING'} />;
  if (user.role === 'admin') return <><div id="admin-dashboard"><AdminMonitoring stats={adminStats} analytics={adminAnalytics} users={adminUsers} donations={adminDonations} pickups={adminPickups} loadingIssues={loadingIssues} onRefresh={onRefresh} /></div><section id="verification" className="workspace"><div className="admin-verification-panels"><div className="metric-grid admin-metrics"><Metric icon={Users} value={adminStats?.users?.donors || 0} label="Total donors" color="navy" /><Metric icon={CircleAlert} value={adminStats?.users?.pendingDonors || 0} label="Pending donors" color="amber" /><Metric icon={ShieldCheck} value={adminStats?.users?.verifiedDonors || 0} label="Verified donors" color="emerald" /><Metric icon={Warehouse} value={adminStats?.ngos?.total || 0} label="Total NGOs" color="blue" /></div><VerificationTable title="NGO verification" records={adminNGOs} kind="ngo" onVerify={onVerify} onView={onViewVerification} /><VerificationTable title="Donor verification" records={adminDonors} kind="donor" onVerify={onVerify} onView={onViewVerification} /></div></section></>;
  if (user.role === 'ngo') return <NgoWorkspace stats={stats} available={availableDonations} pickups={ngoPickups} loadingIssues={loadingIssues} onAccept={onAccept} onSchedule={onSchedule} />;
  return <DonorWorkspace user={user} stats={stats} history={donorHistory} onDonate={onDonate} onView={onView} />;
}

/* ── Donor Workspace ── */
function DonorWorkspace({ user, stats, history, onDonate, onView }) {
  const [filter, setFilter] = useState('ALL');
  const accepted = history.filter(item => ['ACCEPTED', 'PICKUP_SCHEDULED', 'PICKUP_IN_PROGRESS', 'COLLECTED'].includes(item.status)).length;
  const filtered = filter === 'ALL' ? history : history.filter(item => filter === 'PICKUP' ? ['PICKUP_SCHEDULED', 'PICKUP_IN_PROGRESS', 'COLLECTED'].includes(item.status) : item.status === filter);
  return <section className="workspace"><div className="workspace-hero"><div><p className="eyebrow"><Sparkles size={16} /> Donor dashboard</p><h2>Good morning, {user.name.split(' ')[0]}.</h2><p>Every listing helps move good food closer to someone who needs it.</p></div><button className="btn btn-primary" onClick={onDonate}><PackagePlus size={18} /> Donate food</button></div><div className="metric-grid"><Metric icon={PackagePlus} value={history.length} label="Total donations" color="emerald" /><Metric icon={Activity} value={history.filter(item => !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(item.status)).length} label="Active donations" color="blue" /><Metric icon={Route} value={accepted} label="Accepted donations" color="navy" /><Metric icon={Check} value={stats?.completed || 0} label="Completed" color="emerald" /><Metric icon={Heart} value={stats?.meals || 0} label="Meals shared" color="amber" /></div><div className="workspace-columns"><div className="workspace-section"><div className="section-head compact"><div><p className="eyebrow">Your history</p><h3>Donation history</h3></div><span className="section-meta">{history.length} total</span></div><div className="filter-pills">{['ALL', 'AVAILABLE', 'ACCEPTED', 'PICKUP', 'COMPLETED'].map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{statusLabel(item)}</button>)}</div><DonationTable donations={filtered.slice(0, 7)} onView={onView} emptyAction="Donate food" /></div><MiniActivityChart points={history.slice(0, 7).reverse().map(item => ({ count: item.quantity }))} label="Food donated" /></div></section>;
}

/* ── NGO Workspace ── */
function NgoWorkspace({ stats, available, pickups, loadingIssues = [], onAccept, onSchedule }) {
  const activePickups = pickups.filter(item => !['COMPLETED', 'CANCELLED'].includes(item.status));
  return <section className="workspace"><div className="workspace-hero"><div><p className="eyebrow"><Warehouse size={16} /> NGO dashboard</p><h2>Food ready to reach your community.</h2><p>Review nearby donations, accept what you can collect, and keep every handover visible.</p></div><button className="btn btn-ghost" onClick={() => document.getElementById('donations')?.scrollIntoView({ behavior: 'smooth' })}>Browse available food <ArrowRight size={16} /></button></div>{loadingIssues.length > 0 && <p className="workspace-notice"><CircleAlert size={15} /> Some partner data is unavailable until verification is complete.</p>}<div className="metric-grid"><Metric icon={PackagePlus} value={available.length} label="Available donations" color="emerald" /><Metric icon={Check} value={stats?.completed || 0} label="Completed" color="navy" /><Metric icon={Route} value={activePickups.length} label="Active pickups" color="blue" /><Metric icon={Heart} value={stats?.meals || 0} label="Food received" color="amber" /></div><div className="workspace-columns"><div className="workspace-section"><div className="section-head compact"><div><p className="eyebrow">Pickup desk</p><h3>Active pickups</h3></div><span className="section-meta">{activePickups.length} active</span></div>{activePickups.length ? activePickups.slice(0, 4).map((pickup, i) => <article className={`pickup-row fade-up stagger-${Math.min(i + 1, 8)}`} key={pickup.id}><div><strong>{pickup.donation?.foodName || 'Donation pickup'}</strong><span>{pickup.scheduledAt ? formatExpiry(pickup.scheduledAt) : 'Awaiting schedule'} · {pickup.pickupAddress || 'Address shared after acceptance'}</span><PickupTimeline status={pickup.status} /></div><span className={statusClass(pickup.status)}>{statusLabel(pickup.status)}</span></article>) : <EmptyState icon={Route} title="No active pickups." message="Accepted donations will appear here when pickup is arranged." />}</div><MiniActivityChart points={available.slice(0, 7).reverse().map(item => ({ count: item.quantity }))} label="Available food" /></div><div className="workspace-section"><div className="section-head compact"><div><p className="eyebrow">Available donations</p><h3>Ready for a partner</h3></div><span className="section-meta">Verified only</span></div>{available.length ? <div className="compact-donation-grid">{available.slice(0, 3).map((donation, i) => { const expiring = new Date(donation.expiryTime) - Date.now() < 6 * 60 * 60 * 1000; return <article className={`compact-donation fade-up stagger-${Math.min(i + 1, 8)} ${expiring ? 'expiring' : ''}`} key={donation.id}><div className="history-image">{donation.image?.url || donation.imageUrl ? <img src={donation.image?.url || donation.imageUrl} alt="" /> : <Utensils size={20} />}</div><div><strong>{donation.foodName}</strong><span>{donation.quantity} {donation.unit} · expires {formatExpiry(donation.expiryTime)}</span><small>{donation.pickupLocation}</small></div><button className="btn btn-outline btn-sm card-action" onClick={() => onAccept(donation)}>Accept <Check size={16} /></button></article>; })}</div> : <EmptyState icon={MapPin} title="No available donations nearby." message="Check back soon for new food shared by local donors." />}</div></section>;
}

/* ── Admin Components ── */
function AdminTable({ title, columns, rows }) {
  return <div className="admin-table-block"><div className="section-head compact"><h3>{title}</h3><span className="section-meta">{rows.length} shown</span></div>{rows.length ? <div className="admin-table"><div className="admin-table-head">{columns.map(column => <span key={column}>{column}</span>)}</div>{rows.map((row, index) => <div className="admin-table-row" key={`${title}-${index}`}>{row.map((value, cellIndex) => <span key={`${title}-${index}-${cellIndex}`}>{value}</span>)}</div>)}</div> : <p className="table-empty">No records available.</p>}</div>;
}

function AdminMonitoring({ stats, analytics, users = [], donations = [], pickups = [], loadingIssues = [], onRefresh }) {
  const [donationSearch, setDonationSearch] = useState('');
  const [donationStatus, setDonationStatus] = useState('ALL');
  const [userRole, setUserRole] = useState('ALL');
  const filteredDonations = donations.filter(item => (!donationSearch || `${item.foodName} ${item.donorName || ''} ${item.acceptedByName || ''}`.toLowerCase().includes(donationSearch.toLowerCase())) && (donationStatus === 'ALL' || item.status === donationStatus));
  const filteredUsers = users.filter(item => userRole === 'ALL' || item.role === userRole);
  const completed = stats?.donations?.completed || 0;
  const activeDonors = users.filter(item => item.role === 'donor' && item.isActive !== false).length;
  const activeNGOs = users.filter(item => item.role === 'ngo' && item.isActive !== false).length;
  return <section className="workspace"><div className="workspace-hero"><div><p className="eyebrow"><ShieldCheck size={16} /> Admin command center</p><h2>Keep the network moving.</h2><p>Review trust, food flow, people, and pickup operations from one workspace.</p></div><button className="btn btn-ghost" onClick={onRefresh}>Refresh data <Activity size={16} /></button></div>{loadingIssues.length > 0 && <p className="workspace-notice"><CircleAlert size={15} /> Some sections could not be refreshed. Available data is still shown.</p>}{stats ? <div className="metric-grid admin-metrics"><Metric icon={Users} value={stats.users.total} label="Total users" color="navy" /><Metric icon={Heart} value={stats.users.donors} label="Total donors" color="emerald" /><Metric icon={CircleAlert} value={stats.users.pendingDonors || stats.donors?.pending || 0} label="Pending donors" color="amber" /><Metric icon={ShieldCheck} value={stats.users.verifiedDonors || stats.donors?.verified || 0} label="Verified donors" color="emerald" /><Metric icon={Warehouse} value={stats.ngos.total} label="Total NGOs" color="blue" /><Metric icon={CircleAlert} value={stats.ngos.pending} label="Pending NGOs" color="amber" /><Metric icon={ShieldCheck} value={stats.ngos.verified} label="Verified NGOs" color="emerald" /><Metric icon={PackagePlus} value={stats.donations.total} label="Total donations" color="navy" /><Metric icon={Activity} value={stats.donations.available} label="Available" color="blue" /><Metric icon={Route} value={stats.donations.accepted} label="Accepted" color="amber" /><Metric icon={Check} value={completed} label="Completed" color="emerald" /><Metric icon={Route} value={stats.pickups.active} label="Active pickups" color="navy" /></div> : <div className="metric-grid admin-metrics">{[...Array(12)].map((_, i) => <SkeletonCard key={i} />)}</div>}<div id="analytics" className="analytics-grid"><MiniActivityChart points={analytics?.donationsOverTime || []} label="Donations over time" /><MiniActivityChart points={analytics?.usersOverTime?.filter(item => item._id?.role === 'DONOR') || []} label="Donor growth" /><MiniActivityChart points={analytics?.usersOverTime?.filter(item => item._id?.role === 'NGO') || []} label="NGO growth" /><MiniActivityChart points={analytics?.pickupsByStatus || []} label="Pickup activity" /></div><div id="donations" className="admin-data-grid"><div className="admin-table-block"><div className="section-head compact"><div><p className="eyebrow">Donations</p><h3>Donation monitoring</h3></div><span className="section-meta">{filteredDonations.length} shown</span></div><div className="admin-filters"><input aria-label="Search donations" placeholder="Search food, donor, or NGO" value={donationSearch} onChange={event => setDonationSearch(event.target.value)} /><select aria-label="Filter donation status" value={donationStatus} onChange={event => setDonationStatus(event.target.value)}><option value="ALL">All statuses</option>{['AVAILABLE', 'ACCEPTED', 'PICKUP_SCHEDULED', 'PICKUP_IN_PROGRESS', 'COLLECTED', 'COMPLETED'].map(status => <option key={status}>{status}</option>)}</select></div><AdminTable title="" columns={['Food', 'Donor / NGO', 'Qty', 'Status']} rows={filteredDonations.slice(0, 20).map(item => [item.foodName, `${item.donorName || 'Unknown'} / ${item.acceptedByName || 'Unassigned'}`, `${item.quantity} ${item.unit}`, statusLabel(item.status)])} /></div><div id="pickups" className="admin-table-block"><div className="section-head compact"><div><p className="eyebrow">Pickups</p><h3>Pickup monitoring</h3></div><span className="section-meta">{pickups.length} shown</span></div><AdminTable title="" columns={['Donation', 'Donor / NGO', 'Location', 'Status']} rows={pickups.slice(0, 20).map(item => [item.donation?.foodName || 'Donation', `${item.donorName || 'Unknown'} / ${item.ngoName || 'Unknown'}`, item.pickupAddress || 'Location hidden', statusLabel(item.status)])} /></div><div id="users" className="admin-table-block"><div className="section-head compact"><div><p className="eyebrow">Users</p><h3>User management</h3></div><span className="section-meta">{filteredUsers.length} shown</span></div><div className="admin-filters"><select aria-label="Filter user role" value={userRole} onChange={event => setUserRole(event.target.value)}><option value="ALL">All roles</option><option value="DONOR">Donors</option><option value="NGO">NGOs</option><option value="ADMIN">Admins</option></select></div><AdminTable title="" columns={['Name', 'Role', 'Verification', 'Status']} rows={filteredUsers.slice(0, 20).map(item => [item.name, item.role, item.verificationStatus || 'APPROVED', item.isActive === false ? 'Inactive' : 'Active'])} /></div></div><div id="reports" className="report-strip"><Metric icon={PackagePlus} value={stats?.donations?.total || 0} label="Total donations" color="navy" /><Metric icon={Check} value={completed} label="Completed" color="emerald" /><Metric icon={Heart} value={stats?.impact?.totalQuantity || 0} label="Food quantity" color="amber" /><Metric icon={Users} value={activeDonors} label="Active donors" color="blue" /><Metric icon={Warehouse} value={activeNGOs} label="Active NGOs" color="navy" /><Metric icon={CircleAlert} value={(stats?.ngos?.pending || 0) + (stats?.donors?.pending || stats?.users?.pendingDonors || 0)} label="Pending reviews" color="amber" /></div></section>;
}

function VerificationTable({ title, records, kind, onVerify, onView }) {
  return <div className="admin-table-block"><div className="section-head compact"><h3>{title}</h3><span className="section-meta">{records.length} records</span></div>{records.length ? <div className="verification-list">{records.slice(0, 8).map((record, i) => <div className={`verification-row fade-up stagger-${Math.min(i + 1, 8)}`} key={record.id}><div><strong>{kind === 'ngo' ? record.organizationName : record.name}</strong><span>{record.email} · {record.phone || 'Phone not provided'}</span><small>{formatExpiry(record.createdAt)} · {record.address || [record.city, record.state].filter(Boolean).join(', ') || 'Location pending'} · {record.isActive === false ? 'Inactive' : 'Active'}</small></div><span className={statusClass(record.verificationStatus)}>{statusLabel(record.verificationStatus)}</span><div className="verification-actions"><button className="btn btn-outline btn-sm" onClick={() => onView(record, kind)}>View</button>{record.verificationStatus !== 'APPROVED' && record.verificationStatus !== 'VERIFIED' && <button className="btn btn-outline btn-sm" onClick={() => onVerify(record, 'verify', kind)}>Approve</button>}{record.verificationStatus !== 'REJECTED' && <button className="btn btn-outline btn-sm danger" onClick={() => onVerify(record, 'reject', kind)}>Reject</button>}</div></div>)}</div> : <p className="table-empty">No pending verification requests.</p>}</div>;
}

/* ── Password Strength ── */
function PasswordStrength({ password }) {
  if (!password) return null;
  const score = password.length >= 12 ? 'strong' : password.length >= 8 ? 'medium' : 'weak';
  return <div className="pw-strength"><div className={`pw-strength-bar ${score}`} /></div>;
}

/* ═══════════════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════════════ */
function App() {
  const [donations, setDonations] = useState([]);
  const [impact, setImpact] = useState(null);
  const [donationSearch, setDonationSearch] = useState('');
  const [donationType, setDonationType] = useState('all');
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [modal, setModal] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'donor' });
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', profileImage: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [adminNGOs, setAdminNGOs] = useState([]);
  const [adminDonors, setAdminDonors] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [pickupForm, setPickupForm] = useState({ donationId: '', scheduledDate: '', scheduledTime: '', notes: '' });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('success');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [donorHistory, setDonorHistory] = useState([]);
  const [ngoProfile, setNgoProfile] = useState(null);
  const [ngoPickups, setNgoPickups] = useState([]);
  const [availableDonations, setAvailableDonations] = useState([]);
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminDonations, setAdminDonations] = useState([]);
  const [adminPickups, setAdminPickups] = useState([]);
  const [adminHealth, setAdminHealth] = useState(null);
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [verificationTarget, setVerificationTarget] = useState(null);
  const [verificationView, setVerificationView] = useState(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [loadingIssues, setLoadingIssues] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const showToast = useCallback((msg, type = 'success') => { setNotice(msg); setNoticeType(type); }, []);

  const request = async (path, options = {}) => {
    const token = localStorage.getItem('token');
    const method = options.method || 'GET';
    const response = await fetch(`${api}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(data?.message || `Request failed (${response.status}).`);
      error.status = response.status;
      console.warn(`[FeedingMe API] ${method} ${path} -> ${response.status}: ${error.message}`);
      throw error;
    }
    return data;
  };
  const uploadRequest = (path, formData, method = 'POST') => new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open(method, `${api}${path}`); const token = localStorage.getItem('token'); if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.upload.onprogress = event => { if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100)); }; xhr.onload = () => { try { const data = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.message || 'Upload failed.')); } catch { reject(new Error('Upload failed.')); } }; xhr.onerror = () => reject(new Error('Upload failed.')); xhr.onloadend = () => setUploadProgress(0); xhr.send(formData); });
  const loadDonations = () => request('/donations').then(setDonations).catch(() => showToast('Start the API server to see live donations.', 'info'));
  const loadImpact = () => request('/impact').then(setImpact).catch(() => setImpact(null));
  const loadWorkspace = () => request('/dashboard').then(setStats).catch(() => setStats(null));
  const loadNotifications = async () => { if (!localStorage.getItem('token')) return; const items = await optionalRequest('/notifications', []); const unread = await optionalRequest('/notifications/unread-count', { count: 0 }); setNotifications(items); setUnreadCount(unread.count || 0); };
  const optionalRequest = async (path, fallback) => {
    try { return await request(path); } catch (error) { setLoadingIssues(items => [...items, { path, status: error.status }]); return fallback; }
  };
  const loadRoleWorkspace = async account => {
    setWorkspaceLoading(true);
    setWorkspaceError('');
    setLoadingIssues([]);
    try {
      if (account.role === 'donor') {
        const summary = await request('/dashboard');
        const history = await optionalRequest('/donations/my', []);
        setDonorHistory(history); setStats(summary);
      } else if (account.role === 'ngo') {
        const summary = await request('/dashboard');
        const profile = await optionalRequest('/ngos/profile', null);
        if (profile?.verificationStatus !== 'VERIFIED') {
          setNgoProfile(profile); setAvailableDonations([]); setNgoPickups([]); setStats(summary); return;
        }
        const available = await optionalRequest('/donations/available?limit=50', { donations: [] });
        const pickups = await optionalRequest('/pickups/ngo?limit=50', { pickups: [] });
        setNgoProfile(profile); setAvailableDonations(available.donations || []); setNgoPickups(pickups.pickups || []); setStats(summary);
      } else if (account.role === 'admin') {
        const summary = await request('/admin/dashboard/stats');
        const analytics = await optionalRequest('/admin/analytics', null);
        const ngos = await optionalRequest('/admin/ngos', []);
        const donors = await optionalRequest('/admin/donors?limit=50', { items: [] });
        const users = await optionalRequest('/admin/users?limit=50', { items: [] });
        const donations = await optionalRequest('/admin/donations?limit=50', { items: [] });
        const pickups = await optionalRequest('/admin/pickups?limit=50', { pickups: [] });
        const health = await optionalRequest('/admin/system/health', null);
        setAdminStats(summary); setAdminAnalytics(analytics); setAdminNGOs(ngos); setAdminDonors(donors.items || []); setAdminUsers(users.items || []); setAdminDonations(donations.items || []); setAdminPickups(pickups.pickups || []); setAdminHealth(health);
      }
    } catch (error) {
      if (error.status === 401) { localStorage.removeItem('token'); setUser(null); showToast('Your session has expired. Please sign in again.', 'info'); }
      else setWorkspaceError('We could not load the authenticated dashboard. Please try again.');
    }
    finally { setWorkspaceLoading(false); }
  };

  useEffect(() => {
    loadDonations();
    loadImpact();
    const token = localStorage.getItem('token');
    if (token) request('/auth/me').then(value => { const account = normalizeAccount(value); setUser(account); if (account.role === 'admin') window.location.hash = 'admin-dashboard'; loadRoleWorkspace(account); }).catch(() => localStorage.removeItem('token'));
  }, []);
  useEffect(() => { if (!user) return undefined; loadNotifications(); const timer = setInterval(loadNotifications, 45000); return () => clearInterval(timer); }, [user]);

  const authenticate = async event => {
    event.preventDefault();
    try {
      const path = authMode === 'login' ? '/auth/login' : '/auth/register';
      const data = await request(path, { method: 'POST', body: JSON.stringify(authForm) });
      const account = normalizeAccount(data.user); localStorage.setItem('token', data.token); setUser(account); setProfileForm({ name: account.name, phone: account.phone || '', profileImage: account.profileImage || '' }); setModal(null); showToast(`Welcome, ${account.name}.`); if (account.role === 'admin') window.location.hash = 'admin-dashboard'; loadRoleWorkspace(account);
    } catch (error) { showToast(error.message, 'error'); }
  };
  const signOut = () => { request('/auth/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('token'); setUser(null); setStats(null); showToast('You have been signed out.', 'info'); };
  const openProfile = () => { setProfileForm({ name: user.name, phone: user.phone || '', profileImage: user.profileImage || '' }); setModal('profile'); };
  const updateProfile = async event => { event.preventDefault(); try { const { profileImageFile, ...profile } = profileForm; const updated = await request('/users/me', { method: 'PUT', body: JSON.stringify(profile) }); const finalUser = profileImageFile ? await uploadRequest('/users/profile-image', (() => { const data = new FormData(); data.append('image', profileImageFile); return data; })(), 'PUT') : updated; setUser(finalUser); setModal(null); showToast('Profile updated successfully.'); } catch (error) { showToast(error.message, 'error'); } };
  const changePassword = async event => { event.preventDefault(); try { await request('/users/change-password', { method: 'PUT', body: JSON.stringify(passwordForm) }); setPasswordForm({ currentPassword: '', newPassword: '' }); setModal(null); showToast('Password updated successfully.'); } catch (error) { showToast(error.message, 'error'); } };
  const openAdmin = async () => { setModal('admin'); const summary = await optionalRequest('/admin/dashboard/stats', null); const analytics = await optionalRequest('/admin/analytics', null); const ngos = await optionalRequest('/admin/ngos', []); const donors = await optionalRequest('/admin/donors?limit=50', { items: [] }); const users = await optionalRequest('/admin/users?limit=50', { items: [] }); const donations = await optionalRequest('/admin/donations?limit=50', { items: [] }); const pickups = await optionalRequest('/admin/pickups?limit=50', { pickups: [] }); const health = await optionalRequest('/admin/system/health', null); setAdminNGOs(ngos); setAdminDonors(donors.items || []); setAdminStats(summary); setAdminAnalytics(analytics); setAdminUsers(users.items || []); setAdminDonations(donations.items || []); setAdminPickups(pickups.pickups || []); setAdminHealth(health); };
  const markNotificationRead = async notification => { try { if (!notification.isRead) await request(`/notifications/${notification.id}/read`, { method: 'PUT' }); setNotifications(items => items.map(item => item.id === notification.id ? { ...item, isRead: true } : item)); setUnreadCount(count => Math.max(count - (notification.isRead ? 0 : 1), 0)); if (notification.relatedDonationId) document.getElementById('donations')?.scrollIntoView({ behavior: 'smooth' }); } catch (error) { showToast(error.message, 'error'); } };
  const markAllNotificationsRead = async () => { try { await request('/notifications/read-all', { method: 'PUT' }); setNotifications(items => items.map(item => ({ ...item, isRead: true }))); setUnreadCount(0); } catch (error) { showToast(error.message, 'error'); } };
  const deleteNotification = async id => { try { await request(`/notifications/${id}`, { method: 'DELETE' }); setNotifications(items => items.filter(item => item.id !== id)); } catch (error) { showToast(error.message, 'error'); } };
  const useCurrentLocation = () => { if (!navigator.geolocation) return showToast('Location is not supported by this browser.', 'error'); navigator.geolocation.getCurrentPosition(position => setForm(value => ({ ...value, latitude: position.coords.latitude, longitude: position.coords.longitude })), error => showToast(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. You can enter the pickup area manually.' : 'Unable to read your location.', 'error')); };
  const verifyNGO = async (id, action) => { try { const updated = await request(`/admin/ngos/${id}/${action}`, { method: 'PUT', body: JSON.stringify(action === 'reject' ? { reason: 'Please provide the missing verification information.' } : {}) }); setAdminNGOs(items => items.map(item => item.id === updated.id ? updated : item)); showToast(`NGO ${action === 'verify' ? 'verified' : 'rejected'}.`); } catch (error) { showToast(error.message, 'error'); } };
  const requestVerification = (record, action, kind) => setVerificationTarget({ record, action, kind });
  const viewVerification = (record, kind) => setVerificationView({ record, kind });
  const confirmVerification = async () => {
    if (!verificationTarget) return;
    const { record, action, kind } = verificationTarget;
    const isDonor = kind === 'donor';
    const base = isDonor ? '/admin/donors' : '/admin/ngos';
    try {
      const updated = await request(`${base}/${record.id}/${action}`, { method: 'PUT', body: JSON.stringify(action === 'reject' && !isDonor ? { reason: 'Please provide the missing verification information.' } : {}) });
      if (isDonor) setAdminDonors(items => items.map(item => item.id === updated.id ? updated : item)); else setAdminNGOs(items => items.map(item => item.id === updated.id ? updated : item));
      setVerificationTarget(null); showToast(`${isDonor ? 'Donor' : 'NGO'} ${action === 'verify' ? 'approved' : 'rejected'}.`); loadRoleWorkspace(user);
    } catch { showToast('We could not update this verification. Please try again.', 'error'); }
  };
  const submitDonation = async event => {
    event.preventDefault();
    if (user?.role === 'donor' && user.verificationStatus !== 'APPROVED') { setModal(null); showToast(user.verificationStatus === 'REJECTED' ? 'Your donor account has not been approved.' : 'Your account is waiting for Admin verification.', 'info'); return; }
    try { let donation; if (form.imageFile) { const data = new FormData(); Object.entries(form).filter(([key]) => !['imageFile', 'imagePreview'].includes(key) && form[key] !== '').forEach(([key, value]) => data.append(key, value)); data.append('image', form.imageFile); donation = await uploadRequest('/donations', data); } else donation = await request('/donations', { method: 'POST', body: JSON.stringify(form) }); setDonations(items => [donation, ...items]); setForm(emptyForm); setModal(null); showToast('Donation submitted successfully.'); loadRoleWorkspace(user); }
    catch { showToast('We could not submit this donation. Please check the form and try again.', 'error'); }
  };
  const updateStatus = async (id, status) => {
    try { const updated = await request(status === 'ACCEPTED' ? `/donations/${id}/accept` : `/donations/${id}/status`, { method: status === 'ACCEPTED' ? 'POST' : 'PATCH', body: status === 'ACCEPTED' ? undefined : JSON.stringify({ status }) }); setDonations(items => items.map(item => item.id === id ? updated : item)); showToast(`Donation marked ${status.toLowerCase().replace('_', ' ')}.`); loadRoleWorkspace(user); loadNotifications(); }
    catch { showToast('We could not update this donation. Please try again.', 'error'); }
  };
  const schedulePickup = async event => { event.preventDefault(); try { await request('/pickups', { method: 'POST', body: JSON.stringify(pickupForm) }); setPickupForm({ donationId: '', scheduledDate: '', scheduledTime: '', notes: '' }); setModal(null); showToast('Pickup scheduled successfully.'); loadDonations(); loadRoleWorkspace(user); loadNotifications(); } catch { showToast('We could not schedule this pickup. Please try again.', 'error'); } };

  const normalizedSearch = donationSearch.trim().toLowerCase();
  const visibleDonations = donations.filter(donation => {
    const matchesType = donationType === 'all' || donation.foodType === donationType;
    const searchableText = [donation.foodName, donation.pickupLocation, donation.description].filter(Boolean).join(' ').toLowerCase();
    return matchesType && (!normalizedSearch || searchableText.includes(normalizedSearch));
  });

  return <>
    {user?.role === 'admin' && <nav className="admin-nav" aria-label="Admin navigation"><a href="#admin-dashboard">Dashboard</a><a href="#verification">Verification</a><a href="#users">Users</a><a href="#donations">Donations</a><a href="#pickups">Pickups</a><a href="#analytics">Analytics</a><a href="#reports">Reports</a><button onClick={() => setModal('notifications')}>Notifications</button><button onClick={openAdmin}>System Health</button></nav>}
    <a className="skip" href="#main">Skip to content</a>
    <header>
      <a className="brand" href="#top"><span className="brand-mark"><Leaf size={22} /></span>FeedingMe</a>
      <nav className="main-nav" aria-label="Main navigation"><a href="#how">How it works</a><a href="#impact">Our impact</a><a href="#donations">Nearby food</a></nav>
      <div className="header-right">
        {user ? <>
          <button className="notif-btn" title="Notifications" onClick={() => setModal('notifications')}><Bell size={17} />{unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
          <button className="avatar-btn" onClick={openProfile}><span className="avatar-circle">{user.name?.charAt(0)?.toUpperCase()}</span><span>{user.name.split(' ')[0]}</span></button>
          {user.role === 'admin' && <button className="icon-btn" title="Manage NGOs" onClick={openAdmin}><ShieldCheck size={17} /></button>}
          <button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17} /></button>
        </> : <>
          <button className="signin-link" onClick={() => { setAuthMode('login'); setModal('auth'); }}>Sign in</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setAuthMode('register'); setModal('auth'); }}>Join FeedingMe <ArrowRight size={16} /></button>
        </>}
        <button className="hamburger" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Toggle menu"><Menu size={22} /></button>
      </div>
    </header>
    {mobileMenuOpen && <div className="mobile-menu" onClick={() => setMobileMenuOpen(false)}><a href="#how">How it works</a><a href="#impact">Our impact</a><a href="#donations">Nearby food</a>{user && <button onClick={openProfile}>Profile</button>}{user && <button onClick={signOut}>Sign out</button>}{!user && <button onClick={() => { setAuthMode('login'); setModal('auth'); }}>Sign in</button>}{!user && <button onClick={() => { setAuthMode('register'); setModal('auth'); }}>Join FeedingMe</button>}</div>}

    <main id="main">
      {/* Hero */}
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow fade-up"><Heart size={16} /> Food rescue, made local</p>
          <h1 className="fade-up stagger-1">Turn surplus food<br /><em>into shared meals.</em></h1>
          <p className="lede fade-up stagger-2">FeedingMe connects people and organisations with surplus food to verified NGOs, helping rescue good food and get it where it is needed.</p>
          <div className="hero-actions fade-up stagger-3"><button className="btn btn-primary btn-lg" onClick={() => user ? setModal('donate') : setModal('auth')}>Donate food <ArrowRight size={18} /></button><a className="btn btn-ghost btn-lg" href="#donations">Find food support <ArrowRight size={16} /></a></div>
          <div className="hero-trust fade-up stagger-4"><span><ShieldCheck size={18} /> Verified local partners</span><span><Clock3 size={18} /> Rescue before expiry</span></div>
        </div>
        <div className="hero-art fade-up stagger-2"><img src={HERO_IMG} alt="Volunteers preparing food packs for donation" loading="lazy" /><div className="hero-badge"><span>Food waiting to be rescued</span><strong>{donations.filter(item => item.status === 'AVAILABLE').length}</strong><small>available now <ArrowRight size={13} /></small></div></div>
      </section>

      {/* Impact counters */}
      <ImpactCounters impact={impact} />

      {/* How it works */}
      <section className="section" id="how">
        <p className="eyebrow"><Utensils size={16} /> How FeedingMe works</p>
        <h2>From extra food<br />to a shared meal.</h2>
        <div className="steps">{[['01', 'Donate', 'Share surplus food details.'], ['02', 'Verify', 'Admin verifies donors and NGOs.'], ['03', 'Connect', 'Verified NGOs discover available food.'], ['04', 'Pick up', 'An NGO arranges collection.'], ['05', 'Rescue', 'Food reaches people instead of waste.']].map(([number, title, copy], i) => <article className={`step-card fade-up stagger-${i + 1}`} key={number}><span className="step-num">{number}</span><div className="step-icon">{[Heart, ShieldCheck, Users, MapPin, Check][i] ? (() => { const Icon = [Heart, ShieldCheck, Users, MapPin, Check][i]; return <Icon size={22} />; })() : null}</div><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      {/* Rescue flow */}
      <RescueFlow />

      {/* Featured rescue / urgent */}
      <section className="section" id="urgent">
        <div className="section-head"><div><p className="eyebrow amber"><Clock3 size={16} /> Featured rescue</p><h2>Food waiting to be rescued.</h2></div><a className="btn btn-outline btn-sm" href="#donations">See all donations <ArrowRight size={16} /></a></div>
        {donations.filter(item => item.status === 'AVAILABLE').slice(0, 3).length ? <div className="urgent-grid">{donations.filter(item => item.status === 'AVAILABLE').slice(0, 3).map((item, i) => <article className={`urgent-card fade-up stagger-${i + 1}`} key={item.id}><div className="card-img-wrap">{(item.image?.url || item.imageUrl) ? <img src={item.image?.url || item.imageUrl} alt={item.foodName} loading="lazy" /> : <div className="card-img-placeholder"><Utensils size={26} /></div>}</div><div className="urgent-card-body"><div className="urgent-card-top"><span className={new Date(item.expiryTime) - Date.now() < 6 * 60 * 60 * 1000 ? 'urgent-badge' : 'status-badge available'}>{new Date(item.expiryTime) - Date.now() < 6 * 60 * 60 * 1000 ? 'URGENT' : 'AVAILABLE'}</span><small>{formatExpiry(item.createdAt)}</small></div><h3>{item.foodName}</h3><p>{item.quantity} {item.unit} · {item.foodType}</p><span className="urgent-location"><MapPin size={14} /> {item.pickupLocation}</span><button className="btn btn-outline btn-sm card-action" onClick={() => document.getElementById('donations')?.scrollIntoView({ behavior: 'smooth' })}>View donation <ArrowRight size={16} /></button></div></article>)}</div> : <div className="public-empty"><Utensils size={28} /><strong>No food donations are currently waiting for rescue.</strong><p>When a donor shares surplus food, it will appear here for verified local NGOs.</p><button className="btn btn-primary btn-sm" onClick={() => user ? setModal('donate') : setModal('auth')}>Become a donor <ArrowRight size={15} /></button></div>}
      </section>

      {/* Why FeedingMe */}
      <WhyFeedingMe />

      {/* Public impact chart */}
      <section className="section"><div className="public-impact"><div><p className="eyebrow"><Activity size={16} /> Impact over time</p><h2>See the rescue grow.</h2><p>Every completed handoff is a small, measurable step away from waste.</p></div><MiniActivityChart points={impact?.donationsOverTime || []} label="Food rescue activity" /></div></section>

      {/* Role workspace */}
      {user && <RoleWorkspace user={user} stats={stats} donorHistory={donorHistory} ngoProfile={ngoProfile} ngoPickups={ngoPickups} availableDonations={availableDonations} adminStats={adminStats} adminAnalytics={adminAnalytics} adminNGOs={adminNGOs} adminDonors={adminDonors} adminUsers={adminUsers} adminDonations={adminDonations} adminPickups={adminPickups} loading={workspaceLoading} workspaceError={workspaceError} loadingIssues={loadingIssues} onDonate={() => setModal('donate')} onAccept={donation => { setModal('accept'); setSelectedDonation(donation); }} onSchedule={donation => { setPickupForm({ ...pickupForm, donationId: donation.id }); setModal('pickup'); }} onView={donation => { setSelectedDonation(donation); setModal('details'); }} onRefresh={() => loadRoleWorkspace(user)} onVerify={requestVerification} onViewVerification={viewVerification} />}

      {/* Nearby donations */}
      <section className="section" id="donations">
        <div className="section-head"><div><p className="eyebrow"><MapPin size={16} /> Around you</p><h2>Food ready for a good home.</h2></div><button className="btn btn-outline btn-sm" onClick={loadDonations}>Refresh list</button></div>
        <div className="donation-controls"><label>Search food or area<input type="search" value={donationSearch} onChange={event => setDonationSearch(event.target.value)} placeholder="Food name or pickup area" /></label><label>Food type<select value={donationType} onChange={event => setDonationType(event.target.value)}><option value="all">All food types</option><option>Cooked meal</option><option>Bakery</option><option>Fresh produce</option><option>Packaged food</option></select></label><p className="results-count" aria-live="polite">{visibleDonations.length} {visibleDonations.length === 1 ? 'donation' : 'donations'} shown</p></div>
        <div className="donation-grid">{visibleDonations.length ? visibleDonations.map((d, i) => <article className={`donation-card fade-up stagger-${Math.min(i + 1, 8)}`} key={d.id}><div className="card-img-wrap">{(d.image?.url || d.imageUrl) ? <img src={d.image?.url || d.imageUrl} alt={d.foodName} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /> : <div className="card-img-placeholder"><Utensils size={24} /></div>}<span className={`status-badge ${d.status.toLowerCase().replace('_', '-')}`}>{d.status.replace('_', ' ')}</span></div><div className="card-body"><div className="card-top"><div className="food-icon"><Utensils size={20} /></div><div><h3>{d.foodName}</h3><p className="card-meta">{d.quantity} {d.unit} · {d.foodType}</p></div></div><div className="card-details"><span><Clock3 size={15} /> {formatExpiry(d.expiryTime)}</span><span><MapPin size={15} /> {d.pickupLocation}</span></div><MapView coordinates={d.pickupCoordinates} address={d.pickupLocation} />{user?.role === 'ngo' && d.status === 'AVAILABLE' ? <button className="btn btn-primary btn-sm card-action" onClick={() => updateStatus(d.id, 'ACCEPTED')}>Accept pickup <Check size={16} /></button> : user?.role === 'ngo' && d.status === 'ACCEPTED' ? <button className="btn btn-outline btn-sm card-action" onClick={() => { setPickupForm({ ...pickupForm, donationId: d.id }); setModal('pickup'); }}>Schedule pickup <Clock3 size={16} /></button> : user?.role === 'donor' && d.donorId === user.id ? <button className="btn btn-outline btn-sm card-action muted" onClick={() => showToast(`This donation is ${d.status.toLowerCase().replace('_', ' ')}.`, 'info')}>View status <ArrowRight size={16} /></button> : <button className="btn btn-outline btn-sm card-action" onClick={() => setModal('auth')}>I can collect <ArrowRight size={16} /></button>}</div></article>) : <div className="public-empty"><Utensils size={28} /><strong>No donations yet.</strong><p>Be the first to share food or try another search.</p></div>}</div>
      </section>

      {/* CTA */}
      <section className="cta-band"><div><p className="eyebrow"><Heart size={16} /> Your surplus can be someone's supper</p><h2>Make room for<br /><em>more good.</em></h2></div><button className="btn btn-light btn-lg" onClick={() => user ? setModal('donate') : setModal('auth')}>Donate food <ArrowRight size={18} /></button></section>
    </main>

    {/* Footer */}
    <footer><div><a className="brand" href="#top"><span className="brand-mark"><Leaf size={22} /></span>FeedingMe</a><p>Turn surplus food into shared meals.</p></div><nav aria-label="Footer navigation"><a href="#how">How it works</a><a href="#donations">For donors</a><a href="#urgent">For NGOs</a><a href="#impact">Impact</a></nav><span>Built for neighbours helping neighbours.</span></footer>

    {/* Toast */}
    {notice && <div className={`toast ${noticeType}`} role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={17} /></button></div>}

    {/* Verification confirm */}
    {verificationTarget && <div className="overlay"><section className="modal confirm-modal" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close verification confirmation" onClick={() => setVerificationTarget(null)}><X size={20} /></button><div className="confirm-icon"><ShieldCheck size={28} /></div><p className="eyebrow">Confirm verification</p><h2>{verificationTarget.action === 'verify' ? 'Approve this account?' : 'Reject this account?'}</h2><p className="modal-copy">{verificationTarget.record.name || verificationTarget.record.organizationName}<br />{verificationTarget.record.email}</p><div className="modal-actions"><button className="btn btn-outline" onClick={() => setVerificationTarget(null)}>Cancel</button><button className="btn btn-primary" onClick={confirmVerification}>{verificationTarget.action === 'verify' ? 'Approve' : 'Reject'} <Check size={17} /></button></div></section></div>}

    {/* Verification view */}
    {verificationView && <div className="overlay"><section className="modal" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close verification details" onClick={() => setVerificationView(null)}><X size={20} /></button><p className="eyebrow"><ShieldCheck size={16} /> Verification details</p><h2>{verificationView.record.name || verificationView.record.organizationName}</h2><div className="detail-summary"><span>{verificationView.record.email}</span><span>{verificationView.record.phone || 'Phone not provided'}</span><span className={statusClass(verificationView.record.verificationStatus)}>{statusLabel(verificationView.record.verificationStatus)}</span></div><p className="modal-copy">Registered {formatExpiry(verificationView.record.createdAt)}<br />{verificationView.record.address || [verificationView.record.city, verificationView.record.state].filter(Boolean).join(', ') || 'Location not provided'}<br />Account: {verificationView.record.isActive === false ? 'Inactive' : 'Active'}</p><button className="btn btn-primary btn-full" onClick={() => setVerificationView(null)}>Close <Check size={18} /></button></section></div>}

    {/* Accept confirm */}
    {modal === 'accept' && selectedDonation && <div className="overlay"><section className="modal confirm-modal" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close acceptance confirmation" onClick={() => setModal(null)}><X size={20} /></button><div className="confirm-icon"><Check size={28} /></div><p className="eyebrow">Confirm acceptance</p><h2>Are you sure you want to accept this donation?</h2><p className="modal-copy">{selectedDonation.foodName} · {selectedDonation.quantity} {selectedDonation.unit}<br />Pickup area: {selectedDonation.pickupLocation}</p><div className="modal-actions"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { setModal(null); updateStatus(selectedDonation.id, 'ACCEPTED'); }}>Accept donation <Check size={17} /></button></div></section></div>}

    {/* Donation details */}
    {modal === 'details' && selectedDonation && <div className="overlay"><section className="modal wide" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close donation details" onClick={() => setModal(null)}><X size={20} /></button><p className="eyebrow"><Route size={16} /> Donation details</p><h2>{selectedDonation.foodName}</h2><div className="detail-summary"><span>{selectedDonation.quantity} {selectedDonation.unit}</span><span>{selectedDonation.pickupLocation}</span><span>{formatExpiry(selectedDonation.createdAt)}</span></div><StatusTimeline status={selectedDonation.status} /><div className="detail-map"><MapView coordinates={selectedDonation.pickupCoordinates} address={selectedDonation.pickupLocation} /></div><button className="btn btn-primary btn-full" onClick={() => setModal(null)}>Done <Check size={18} /></button></section></div>}

    {/* Profile */}
    {modal === 'profile' && user && <div className="overlay"><section className="modal" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close profile" onClick={() => setModal(null)}><X size={20} /></button><p className="eyebrow"><ShieldCheck size={16} /> Account profile</p><h2>Keep your details current.</h2><div className="profile-avatar">{user.profileImage ? <img src={user.profileImage} alt="" /> : user.name?.charAt(0)?.toUpperCase()}</div><div className="account-info"><div className="account-info-row"><span>Email</span><strong>{user.email}</strong></div><div className="account-info-row"><span>Role</span><strong>{user.role}</strong></div><p className="account-info-note">Your role can only be changed by an administrator.</p></div><form onSubmit={updateProfile}><label>Name<input required minLength="2" value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} /></label><label>Phone<input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+91 98765 43210" /></label><label>Profile image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) setProfileForm({ ...profileForm, profileImageFile: file }); }} /></label>{profileForm.profileImageFile && <small className="location-note">Selected: {profileForm.profileImageFile.name}</small>}<button className="btn btn-primary btn-full" type="submit">Save profile {uploadProgress > 0 && `(${uploadProgress}%)`} <Check size={18} /></button></form><button className="switch-auth" onClick={() => setModal('password')}>Change password</button></section></div>}

    {/* Password */}
    {modal === 'password' && <div className="overlay"><section className="modal" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close password form" onClick={() => setModal(null)}><X size={20} /></button><p className="eyebrow"><ShieldCheck size={16} /> Password security</p><h2>Change your password.</h2><form onSubmit={changePassword}><label>Current password<div style={{position:'relative'}}><input required type={showPassword ? 'text' : 'password'} value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} style={{paddingRight:'44px'}} /><button type="button" onClick={() => setShowPassword(v => !v)} style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'none',border:0,color:'var(--n-400)'}}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><label>New password<input required minLength="8" type={showPassword ? 'text' : 'password'} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="At least 8 characters" /><PasswordStrength password={passwordForm.newPassword} /></label><button className="btn btn-primary btn-full" type="submit">Update password <Check size={18} /></button></form></section></div>}

    {/* Admin modal */}
    {modal === 'admin' && <div className="overlay"><section className="modal wide" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close NGO management" onClick={() => setModal(null)}><X size={20} /></button><p className="eyebrow"><ShieldCheck size={16} /> Command center</p><h2>Platform, in one view.</h2>{adminStats && <div className="admin-stat-grid"><div><strong>{adminStats.users.total}</strong><span>users</span></div><div><strong>{adminStats.ngos.verified}</strong><span>verified NGOs</span></div><div><strong>{adminStats.donations.total}</strong><span>donations</span></div><div><strong>{adminStats.pickups.active}</strong><span>active pickups</span></div><div><strong>{adminStats.impact.totalQuantity}</strong><span>food quantity</span></div><div><strong>{adminStats.impact.completedQuantity}</strong><span>completed quantity</span></div></div>}<h3 style={{fontFamily:'var(--font-head)',fontSize:'18px',margin:'24px 0 8px'}}>NGO verification queue</h3><div className="admin-list">{adminNGOs.length ? adminNGOs.map(ngo => <article className="admin-row" key={ngo.id}><div><strong>{ngo.organizationName}</strong><span>{ngo.email} · {ngo.verificationStatus}</span></div><div className="admin-actions">{ngo.verificationStatus !== 'VERIFIED' && <button className="btn btn-outline btn-sm" onClick={() => verifyNGO(ngo.id, 'verify')}>Verify</button>}{ngo.verificationStatus !== 'REJECTED' && <button className="btn btn-outline btn-sm danger" onClick={() => verifyNGO(ngo.id, 'reject')}>Reject</button>}</div></article>) : <p className="table-empty">No NGO profiles have been submitted.</p>}</div></section></div>}

    {/* Notifications */}
    {modal === 'notifications' && <div className="overlay"><section className="modal wide" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close notifications" onClick={() => setModal(null)}><X size={20} /></button><div className="notification-heading"><div><p className="eyebrow"><Bell size={16} /> Notification center</p><h2>Updates that matter.</h2></div><button className="btn btn-outline btn-sm" onClick={markAllNotificationsRead}>Mark all read</button></div><div className="notification-list">{notifications.length ? notifications.map((item, i) => <article className={`notification-item ${item.isRead ? 'read' : 'unread'} fade-up stagger-${Math.min(i + 1, 8)}`} key={item.id} onClick={() => markNotificationRead(item)}><div><strong>{item.title}</strong><p>{item.message}</p><small>{formatExpiry(item.createdAt)}</small></div><button className="icon-btn" title="Delete notification" style={{background:'var(--n-100)',color:'var(--n-500)'} } onClick={event => { event.stopPropagation(); deleteNotification(item.id); }}><Trash2 size={16} /></button></article>) : <div className="empty-state"><Bell size={28} /><strong>No notifications yet</strong><p>You're all caught up.</p></div>}</div></section></div>}

    {/* Pickup form */}
    {modal === 'pickup' && <div className="overlay"><section className="modal" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close pickup form" onClick={() => setModal(null)}><X size={20} /></button><p className="eyebrow"><Clock3 size={16} /> Pickup coordination</p><h2>Schedule the handover.</h2><form onSubmit={schedulePickup}><label>Date<input required type="date" value={pickupForm.scheduledDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setPickupForm({ ...pickupForm, scheduledDate: e.target.value })} /></label><label>Time<input required type="time" value={pickupForm.scheduledTime} onChange={e => setPickupForm({ ...pickupForm, scheduledTime: e.target.value })} /></label><label>Notes<textarea value={pickupForm.notes} onChange={e => setPickupForm({ ...pickupForm, notes: e.target.value })} placeholder="Gate, contact, or handover notes" /></label><button className="btn btn-primary btn-full" type="submit">Schedule pickup <Check size={18} /></button></form></section></div>}

    {/* Auth modal */}
    {modal === 'auth' && <div className="overlay"><section className="auth-split" role="dialog" aria-modal="true"><div className="auth-left"><img src={AUTH_IMG} alt="" /><div><p className="eyebrow"><Heart size={16} /> Join the movement</p><h2>{authMode === 'login' ? 'Welcome back' : 'Start helping'}</h2><p>{authMode === 'login' ? 'Pick up where your good work left off.' : 'Join donors and local organisations making food count.'}</p><div className="auth-trust"><span><ShieldCheck size={16} /> Verified local partners</span><span><Heart size={16} /> Trusted by communities</span><span><MapPin size={16} /> Local impact</span></div></div></div><button className="close-btn" aria-label="Close" onClick={() => setModal(null)} style={{position:'absolute',right:'20px',top:'20px',zIndex:10}}><X size={20} /></button><div className="auth-right"><h2>{authMode === 'login' ? 'Sign in to FeedingMe' : 'Create your account'}</h2><p className="modal-copy">{authMode === 'login' ? 'Pick up where your good work left off.' : 'Join donors and local organisations making food count.'}</p><form onSubmit={authenticate}>{authMode === 'register' && <label>Your name<input required value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Asha Kitchen" /></label>}<label>Email<input required type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="you@example.com" /></label><label>Password<div style={{position:'relative'}}><input required minLength="8" type={showPassword ? 'text' : 'password'} value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="At least 8 characters" style={{paddingRight:'44px'}} /><button type="button" onClick={() => setShowPassword(v => !v)} style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'none',border:0,color:'var(--n-400)'}}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{authMode === 'register' && <label>I am joining as<div className="role-selector"><div className={`role-card ${authForm.role === 'donor' ? 'selected' : ''}`} onClick={() => setAuthForm({ ...authForm, role: 'donor' })}><Heart size={22} /><strong>Food Donor</strong><small>Share surplus food</small></div><div className={`role-card ${authForm.role === 'ngo' ? 'selected' : ''}`} onClick={() => setAuthForm({ ...authForm, role: 'ngo' })}><Warehouse size={22} /><strong>NGO / Trust</strong><small>Collect donations</small></div></div></label>}<button className="btn btn-primary btn-full" type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={18} /></button></form><button className="switch-auth" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></div></section></div>}

    {/* Donation form */}
    {modal === 'donate' && <div className="overlay"><section className="modal wide" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Close donation form" onClick={() => setModal(null)}><X size={20} /></button><p className="eyebrow"><PackagePlus size={16} /> Share food</p><h2>Post a donation</h2><p className="modal-copy">A few details help the right local partner respond quickly.</p><form onSubmit={submitDonation}><label>Food name<input required value={form.foodName} onChange={e => setForm({ ...form, foodName: e.target.value })} placeholder="e.g. Vegetable pulao" /></label><div className="form-row"><label>Quantity<input required min="1" type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="35" /></label><label>Unit<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}><option>meals</option><option>kg</option><option>packs</option></select></label></div><label>Food type<select value={form.foodType} onChange={e => setForm({ ...form, foodType: e.target.value })}><option>Cooked meal</option><option>Bakery</option><option>Fresh produce</option><option>Packaged food</option></select></label><label>Collect before<input required type="datetime-local" value={form.expiryTime} onChange={e => setForm({ ...form, expiryTime: e.target.value })} /></label><label>Pickup area<input required value={form.pickupLocation} onChange={e => setForm({ ...form, pickupLocation: e.target.value })} placeholder="Anna Nagar, Chennai" /></label><label>Food image<div className="upload-zone" onClick={e => e.currentTarget.querySelector('input')?.click()} onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }} onDragLeave={e => e.currentTarget.classList.remove('dragover')} onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); const file = e.dataTransfer.files?.[0]; if (file) setForm({ ...form, imageFile: file, imagePreview: URL.createObjectURL(file) }); }}><PackagePlus size={28} /><p><strong>Drop image or click to browse</strong></p><input type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={e => { const file = e.target.files?.[0]; if (file) setForm({ ...form, imageFile: file, imagePreview: URL.createObjectURL(file) }); }} /></div></label><p className="upload-hint">JPEG, PNG, or WEBP up to 5 MB</p>{form.imagePreview && <img className="upload-preview" src={form.imagePreview} alt="Selected food" />}<button className="location-button" type="button" onClick={useCurrentLocation}><MapPin size={16} /> Use current location</button>{form.latitude && <small className="location-note">Location captured. You can still edit the pickup area above.</small>}<button className="btn btn-primary btn-full" type="submit" disabled={uploadProgress > 0}>{uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Publish donation'} <ArrowRight size={18} />{uploadProgress > 0 && <span className="btn-progress" style={{width:`${uploadProgress}%`}} />}</button></form></section></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
