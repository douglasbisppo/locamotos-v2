'use strict';

const express = require('express');
const router = express.Router();

// ─── Softruck API Config ──────────────────────────────────────────────────────
const SOFTRUCK_AUTH_URL = 'https://api.app.softruck.com/api/v5/auth/login';
const SOFTRUCK_TRACKING_URL = 'https://api.tracking.softruck.com/responsibles';
const SOFTRUCK_VEHICLES_URL = 'https://api.app.softruck.com/api/v5/vehicles';
const SOFTRUCK_DEVICES_URL = 'https://api.app.softruck.com/api/v5/devices';

const SOFTRUCK_USERNAME = process.env.SOFTRUCK_USERNAME;
const SOFTRUCK_PASSWORD = process.env.SOFTRUCK_PASSWORD;
const SOFTRUCK_RESPONSIBLE_ID = '5paxZxnkx9LWbP3';

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

// ─── Helper: Get Softruck JWT ─────────────────────────────────────────────────
async function getSoftruckToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!SOFTRUCK_USERNAME || !SOFTRUCK_PASSWORD) {
    throw new Error('SOFTRUCK_USERNAME e SOFTRUCK_PASSWORD não configurados no .env');
  }

  const res = await fetch(SOFTRUCK_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: SOFTRUCK_USERNAME,
      password: SOFTRUCK_PASSWORD,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Softruck auth failed: ${res.status} - ${text}`);
  }

  const data = await res.json();
  // Softruck wraps response in { data: { token, refresh_token } }
  cachedToken = data.token || (data.data && data.data.token);
  if (!cachedToken) {
    throw new Error('No token in Softruck auth response: ' + JSON.stringify(data).substring(0, 200));
  }
  // Cache for 20 hours (tokens typically expire in 24h)
  tokenExpiry = Date.now() + 20 * 60 * 60 * 1000;
  return cachedToken;
}

// ─── Auth middleware (reuse from main app) ────────────────────────────────────
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.warn('[TRACKING] JWT_SECRET não configurado no .env');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'locamotos',
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) return res.status(403).json({ error: 'Acesso restrito' });
    const { rows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1', [userId]
    );
    if (!rows.length || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    req.user.role = 'admin';
    next();
  } catch (err) {
    console.error('Admin check error:', err);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}

// ─── GET /api/tracking/positions ──────────────────────────────────────────────
// Returns all vehicle positions from Softruck tracking API
router.get('/positions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const token = await getSoftruckToken();

    const vtypes = encodeURIComponent('["CAR","MOTORCYCLE","TRUCK/BUS","OTHER",null]');
    const url = `${SOFTRUCK_TRACKING_URL}/${SOFTRUCK_RESPONSIBLE_ID}?token=${token}&vtypes=${vtypes}`;

    const trackingRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!trackingRes.ok) {
      const text = await trackingRes.text();
      throw new Error(`Tracking API error: ${trackingRes.status} - ${text}`);
    }

    const geojson = await trackingRes.json();

    // Transform GeoJSON features into a cleaner format for the frontend
    const vehicles = (geojson.features || []).map(feature => {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates || [0, 0];
      const lastUpdate = props.act ? new Date(props.act * 1000) : null;
      const now = new Date();
      const diffHours = lastUpdate ? (now - lastUpdate) / (1000 * 60 * 60) : Infinity;

      let status = 'offline';
      if (diffHours < 1) {
        status = props.ign ? 'moving' : 'stopped';
      } else if (diffHours < 24) {
        status = 'idle';
      }

      return {
        id: props.id,
        uuid: props.uuid,
        plate: props.lbl || 'Sem placa',
        lat: coords[1],
        lng: coords[0],
        ignition: props.ign || false,
        speed: props.spd || 0,
        direction: props.dir || 0,
        battery: props.bl || 0,
        voltage: props.pv || 0,
        status,
        signalStatus: props.st || 'unknown',
        lastUpdate: lastUpdate ? lastUpdate.toISOString() : null,
        lastUpdateHuman: lastUpdate ? formatTimeAgo(lastUpdate) : 'Desconhecido',
      };
    });

    // Sort: active first, then by last update descending
    vehicles.sort((a, b) => {
      const order = { moving: 0, stopped: 1, idle: 2, offline: 3 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (b.lastUpdate || '').localeCompare(a.lastUpdate || '');
    });

    // Merge odometer data from database
    try {
      const { rows: odoRows } = await pool.query(
        'SELECT plate, (total_km + COALESCE(odometer_offset, 0)) as total_km, COALESCE(odometer_offset, 0) as odometer_offset, last_recorded_at FROM vehicle_odometer_total'
      );
      const odoMap = {};
      for (const r of odoRows) odoMap[r.plate] = r;
      for (const v of vehicles) {
        const odo = odoMap[v.plate];
        v.odometer = odo ? parseFloat(odo.total_km) : 0;
        v.odometerOffset = odo ? parseFloat(odo.odometer_offset) : 0;
        v.odometerLastReading = odo ? odo.last_recorded_at : null;
      }
    } catch (odoErr) {
      console.error('Odometer merge error:', odoErr.message);
    }

    res.json({
      success: true,
      count: vehicles.length,
      vehicles,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Tracking positions error:', err);
    res.status(500).json({ error: err.message || 'Erro ao buscar posições' });
  }
});

// ─── GET /api/tracking/vehicles ───────────────────────────────────────────────
// Returns full vehicle details including odometer from Softruck
router.get('/vehicles', requireAuth, requireAdmin, async (req, res) => {
  try {
    const token = await getSoftruckToken();

    const vehiclesRes = await fetch(SOFTRUCK_VEHICLES_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!vehiclesRes.ok) {
      const text = await vehiclesRes.text();
      throw new Error(`Vehicles API error: ${vehiclesRes.status} - ${text}`);
    }

    const data = await vehiclesRes.json();
    const vehicles = Array.isArray(data) ? data : (data.vehicles || data.data || []);

    res.json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (err) {
    console.error('Tracking vehicles error:', err);
    res.status(500).json({ error: err.message || 'Erro ao buscar veículos' });
  }
});

// ─── GET /api/tracking/devices ────────────────────────────────────────────────
// Returns device details from Softruck
router.get('/devices', requireAuth, requireAdmin, async (req, res) => {
  try {
    const token = await getSoftruckToken();

    const devicesRes = await fetch(SOFTRUCK_DEVICES_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!devicesRes.ok) {
      const text = await devicesRes.text();
      throw new Error(`Devices API error: ${devicesRes.status} - ${text}`);
    }

    const data = await devicesRes.json();
    const devices = Array.isArray(data) ? data : (data.devices || data.data || []);

    res.json({
      success: true,
      count: devices.length,
      devices,
    });
  } catch (err) {
    console.error('Tracking devices error:', err);
    res.status(500).json({ error: err.message || 'Erro ao buscar dispositivos' });
  }
});

// ─── Helper: Human-readable time ago ──────────────────────────────────────────
function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes}min atras`;
  if (hours < 24) return `${hours}h atras`;
  if (days === 1) return 'Ontem';
  if (days < 30) return `${days} dias atras`;
  return date.toLocaleDateString('pt-BR');
}



// ─── POST /api/tracking/odometer-poll ─────────────────────────────────────────
// Called by cron every 2 minutes to save odometer data for vehicles with ignition ON
router.post('/odometer-poll', async (req, res) => {
  // Protect cron endpoint with API key
  const cronKey = req.headers['x-cron-key'] || req.query.key;
  const expectedKey = process.env.CRON_API_KEY;
  if (expectedKey && cronKey !== expectedKey) {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }

  try {
    const token = await getSoftruckToken();
    const vtypes = encodeURIComponent(JSON.stringify(["CAR","MOTORCYCLE","TRUCK/BUS","OTHER",null]));
    const trackUrl = `${SOFTRUCK_TRACKING_URL}/${SOFTRUCK_RESPONSIBLE_ID}?token=${token}&vtypes=${vtypes}`;

    const trackRes = await fetch(trackUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!trackRes.ok) {
      throw new Error(`Tracking API error: ${trackRes.status} - ${await trackRes.text()}`);
    }

    const geoJson = await trackRes.json();
    const features = geoJson.features || [];

    let saved = 0;
    let skipped = 0;

    for (const feature of features) {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates; // [lng, lat]
      if (!coords || coords.length < 2) continue;

      const plate = props.lbl || '';
      const softruckId = String(props.id || '');
      const ignition = props.ign === true || props.ign === 1;
      const speed = props.spd || 0;
      const lat = coords[1];
      const lng = coords[0];

      if (!plate) continue;

      // Only save when ignition is ON
      if (!ignition) {
        skipped++;
        continue;
      }

      // Get last known position for this vehicle
      const { rows: lastRows } = await pool.query(
        'SELECT * FROM vehicle_odometer_total WHERE plate = $1 LIMIT 1',
        [plate]
      );

      let distanceKm = 0;

      if (lastRows.length > 0) {
        const last = lastRows[0];
        // Calculate distance using Haversine formula
        distanceKm = haversineDistance(last.last_lat, last.last_lng, lat, lng);

        // Skip if distance is tiny (< 10 meters) to avoid GPS noise
        if (distanceKm < 0.01) {
          skipped++;
          continue;
        }

        // Skip if distance is impossibly large (> 50km in one poll = GPS glitch)
        if (distanceKm > 50) {
          console.log(`[ODOMETER] Skipping glitch for ${plate}: ${distanceKm.toFixed(2)}km`);
          skipped++;
          continue;
        }

        // Update total
        await pool.query(
          `UPDATE vehicle_odometer_total 
           SET total_km = total_km + $1, last_lat = $2, last_lng = $3, last_recorded_at = NOW()
           WHERE plate = $4`,
          [distanceKm, lat, lng, plate]
        );
      } else {
        // First record for this vehicle - just insert initial position
        await pool.query(
          `INSERT INTO vehicle_odometer_total (plate, total_km, last_lat, last_lng, last_recorded_at)
           VALUES ($1, 0, $2, $3, NOW())`,
          [plate, lat, lng]
        );
      }

      // Save to history
      await pool.query(
        `INSERT INTO vehicle_odometer (plate, softruck_id, odometer_km, lat, lng, ignition, speed, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [plate, softruckId, distanceKm, lat, lng, ignition, speed]
      );

      saved++;
    }

    console.log(`[ODOMETER] Poll complete: ${saved} saved, ${skipped} skipped`);
    res.json({ success: true, saved, skipped, total: features.length });
  } catch (err) {
    console.error('Odometer poll error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tracking/odometer ───────────────────────────────────────────────
// Returns current odometer totals for all vehicles
router.get('/odometer', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT vt.plate, (vt.total_km + COALESCE(vt.odometer_offset, 0)) as total_km, vt.total_km as calculated_km, COALESCE(vt.odometer_offset, 0) as odometer_offset, vt.last_lat, vt.last_lng, vt.last_recorded_at,
              m.modelo, m.cor, m.ano_fabricacao
       FROM vehicle_odometer_total vt
       LEFT JOIN motos m ON m.placa = vt.plate
       ORDER BY vt.plate`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Odometer totals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tracking/odometer-history/:plate ────────────────────────────────
// Returns odometer history for a specific vehicle
router.get('/odometer-history/:plate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { plate } = req.params;
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    // Daily summary
    const { rows: daily } = await pool.query(
      `SELECT 
         DATE(recorded_at) as date,
         SUM(odometer_km) as km_day,
         COUNT(*) as readings,
         MAX(speed) as max_speed,
         AVG(speed) as avg_speed
       FROM vehicle_odometer
       WHERE plate = $1 AND recorded_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(recorded_at)
       ORDER BY date DESC`,
      [plate, days]
    );

    // Total
    const { rows: total } = await pool.query(
      'SELECT total_km, last_recorded_at FROM vehicle_odometer_total WHERE plate = $1',
      [plate]
    );

    res.json({
      success: true,
      plate,
      total_km: total[0]?.total_km || 0,
      last_recorded: total[0]?.last_recorded_at || null,
      daily,
    });
  } catch (err) {
    console.error('Odometer history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Haversine Distance (km) ──────────────────────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}



// ─── PATCH /api/tracking/odometer-offset ──────────────────────────────────────
// Set the initial odometer offset for a vehicle
router.patch('/odometer-offset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { plate, offset } = req.body;
    if (!plate || offset === undefined) {
      return res.status(400).json({ error: 'plate and offset required' });
    }
    const numericOffset = parseFloat(offset);
    if (isNaN(numericOffset) || numericOffset < 0 || numericOffset > 999999) {
      return res.status(400).json({ error: 'offset deve ser um número entre 0 e 999999' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM vehicle_odometer_total WHERE plate = $1',
      [plate]
    );

    if (rows.length === 0) {
      // Create entry if not exists
      await pool.query(
        `INSERT INTO vehicle_odometer_total (plate, total_km, odometer_offset, last_lat, last_lng, last_recorded_at)
         VALUES ($1, 0, $2, 0, 0, NOW())`,
        [plate, numericOffset]
      );
    } else {
      await pool.query(
        'UPDATE vehicle_odometer_total SET odometer_offset = $1 WHERE plate = $2',
        [numericOffset, plate]
      );
    }

    // Create system alert for admin review
    const userName = req.user?.email || req.user?.display_name || 'Usuario';
    const userId = req.user?.id || req.user?.sub || null;
    const previousOffset = rows.length > 0 ? (rows[0].odometer_offset || 0) : 0;
    
    await pool.query(
      `INSERT INTO system_alerts (type, title, description, plate, user_name, user_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'odometer_adjustment',
        'Ajuste de Odometro',
        `KM inicial ajustado para ${numericOffset} km (anterior: ${previousOffset} km)`,
        plate,
        userName,
        userId,
        JSON.stringify({ plate, new_offset: numericOffset, previous_offset: previousOffset })
      ]
    );

    res.json({ success: true, plate, offset: numericOffset });
  } catch (err) {
    console.error('Odometer offset error:', err);
    res.status(500).json({ error: err.message });
  }
});



// ─── GET /api/tracking/alerts ─────────────────────────────────────────────────
// Returns system alerts for admin dashboard
router.get('/alerts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    
    let query = 'SELECT * FROM system_alerts';
    const params = [];
    
    if (unreadOnly) {
      query += ' WHERE is_read = false';
    }
    
    query += ' ORDER BY created_at DESC LIMIT $1';
    params.push(limit);
    
    const { rows } = await pool.query(query, params);
    
    // Count unread
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) as count FROM system_alerts WHERE is_read = false'
    );
    
    res.json({
      success: true,
      alerts: rows,
      unread_count: parseInt(countRows[0].count),
    });
  } catch (err) {
    console.error('Alerts fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/tracking/alerts/:id/read ──────────────────────────────────────
// Mark an alert as read
router.patch('/alerts/:id/read', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE system_alerts SET is_read = true WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/tracking/alerts/read-all ──────────────────────────────────────
// Mark all alerts as read
router.patch('/alerts/read-all', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE system_alerts SET is_read = true WHERE is_read = false');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
