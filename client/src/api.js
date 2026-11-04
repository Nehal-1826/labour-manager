import { supabase } from './lib/supabase';

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

function sessionExpired() {
  // let App.jsx drop back to the login screen
  window.dispatchEvent(new CustomEvent('auth:logout'));
}

async function request(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    sessionExpired();
    throw new Error(data.error || 'Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// authenticated download of .docx reports (fetch -> blob -> save,
// because plain links cannot carry the Authorization header)
export async function downloadFile(path) {
  const token = await getAccessToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    sessionExpired();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const j = await res.json();
      if (j.error) message = j.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const match = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = match ? match[1] : 'report.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export const api = {
  dashboard: () => request('/api/dashboard'),
  labours: () => request('/api/labours'),
  labourProfile: (id) => request(`/api/labours/${id}`),
  addLabour: (body) => request('/api/labours', { method: 'POST', body: JSON.stringify(body) }),
  updateLabour: (id, body) => request(`/api/labours/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLabour: (id) => request(`/api/labours/${id}`, { method: 'DELETE' }),
  attendance: (date) => request(`/api/attendance/${date}`),
  markAttendance: (body) => request('/api/attendance', { method: 'POST', body: JSON.stringify(body) }),
  clearAttendance: (labourId, date) =>
    request(`/api/attendance/${labourId}/${date}`, { method: 'DELETE' }),
};
