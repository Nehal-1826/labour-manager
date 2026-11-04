async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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
