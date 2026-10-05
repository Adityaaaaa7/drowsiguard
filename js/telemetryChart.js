/**
 * Real-time Chart.js Telemetry Engine & Data Export Manager
 * Logs EAR, MAR, PERCLOS, and prediction states with timestamp exports.
 */
class TelemetryManager {
    constructor() {
        this.earChart = null;
        this.marChart = null;
        this.telemetryLogs = [];
        this.maxChartPoints = 40;
    }

    initCharts() {
        const ctxEar = document.getElementById('chart-ear')?.getContext('2d');
        const ctxMar = document.getElementById('chart-mar')?.getContext('2d');

        if (ctxEar) {
            this.earChart = new Chart(ctxEar, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Eye Aspect Ratio (EAR)',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0
                    }, {
                        label: 'EAR Threshold',
                        data: [],
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { display: false },
                        y: { min: 0, max: 0.5, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
                    },
                    plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } }
                }
            });
        }

        if (ctxMar) {
            this.marChart = new Chart(ctxMar, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Mouth Aspect Ratio (MAR)',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0
                    }, {
                        label: 'Yawn Threshold (0.65)',
                        data: [],
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { display: false },
                        y: { min: 0, max: 1.0, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
                    },
                    plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } }
                }
            });
        }
    }

    /**
     * Add new frame data point to telemetry
     */
    addRecord(ear, mar, perclos, stateLabel, earThresh = 0.17, marThresh = 0.65) {
        const timeStr = new Date().toLocaleTimeString();

        // Update Charts
        if (this.earChart) {
            this.earChart.data.labels.push(timeStr);
            this.earChart.data.datasets[0].data.push(ear);
            this.earChart.data.datasets[1].data.push(earThresh);

            if (this.earChart.data.labels.length > this.maxChartPoints) {
                this.earChart.data.labels.shift();
                this.earChart.data.datasets[0].data.shift();
                this.earChart.data.datasets[1].data.shift();
            }
            this.earChart.update('none');
        }

        if (this.marChart) {
            this.marChart.data.labels.push(timeStr);
            this.marChart.data.datasets[0].data.push(mar);
            this.marChart.data.datasets[1].data.push(marThresh);

            if (this.marChart.data.labels.length > this.maxChartPoints) {
                this.marChart.data.labels.shift();
                this.marChart.data.datasets[0].data.shift();
                this.marChart.data.datasets[1].data.shift();
            }
            this.marChart.update('none');
        }

        // Store log sample every ~500ms
        const now = Date.now();
        if (!this.lastLoggedTime || now - this.lastLoggedTime >= 500) {
            this.lastLoggedTime = now;
            const mqttStatus = window.hardwareBridge ? window.hardwareBridge.connectionState : 'DISCONNECTED';
            const esp32Status = window.hardwareBridge ? (window.hardwareBridge.isEsp32Online ? 'ONLINE' : 'OFFLINE') : 'OFFLINE';

            const record = {
                timestamp: new Date().toISOString(),
                ear: ear.toFixed(3),
                mar: mar.toFixed(3),
                perclos: perclos + '%',
                eyeStatus: ear < earThresh ? 'CLOSED' : 'OPEN',
                prediction: stateLabel,
                mqtt: mqttStatus,
                esp32: esp32Status
            };
            this.telemetryLogs.push(record);
            this.appendTableRow(record);
        }
    }

    appendTableRow(rec) {
        const tbody = document.getElementById('telemetry-log-tbody');
        const countBadge = document.getElementById('log-count');
        if (!tbody) return;

        // Remove empty state row if present
        const emptyRow = tbody.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();

        const tr = document.createElement('tr');
        const isWarning = rec.prediction === 'WARNING' || rec.prediction === 'DROWSY';
        tr.style.color = isWarning ? '#ef4444' : 'inherit';

        tr.innerHTML = `
            <td>${rec.timestamp.split('T')[1].split('.')[0]}</td>
            <td><strong>${rec.ear}</strong></td>
            <td>${rec.mar}</td>
            <td>${rec.perclos}</td>
            <td><span class="badge ${rec.eyeStatus === 'CLOSED' ? 'btn-danger-subtle' : 'status-ready'}">${rec.eyeStatus}</span></td>
            <td><strong>${rec.prediction}</strong></td>
        `;

        tbody.insertBefore(tr, tbody.firstChild);

        // Keep table size manageable in DOM
        if (tbody.children.length > 50) {
            tbody.removeChild(tbody.lastChild);
        }

        if (countBadge) {
            countBadge.innerText = `${this.telemetryLogs.length} records logged`;
        }
    }

    exportCSV() {
        if (this.telemetryLogs.length === 0) {
            alert("No telemetry logs recorded yet. Start camera monitoring to capture data.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,Timestamp,EAR,MAR,PERCLOS,EyeStatus,Prediction,MQTT,ESP32\n";
        this.telemetryLogs.forEach(row => {
            csvContent += `${row.timestamp},${row.ear},${row.mar},${row.perclos},${row.eyeStatus},${row.prediction},${row.mqtt || 'N/A'},${row.esp32 || 'N/A'}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `drowsiness_telemetry_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    exportJSON() {
        if (this.telemetryLogs.length === 0) {
            alert("No telemetry logs recorded yet.");
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.telemetryLogs, null, 2));
        const link = document.createElement("a");
        link.setAttribute("href", dataStr);
        link.setAttribute("download", `drowsiness_research_data_${Date.now()}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    resetData() {
        this.telemetryLogs = [];
        const tbody = document.getElementById('telemetry-log-tbody');
        const countBadge = document.getElementById('log-count');
        if (tbody) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">No telemetry records captured yet. Start camera monitoring to collect data.</td>
                </tr>
            `;
        }
        if (countBadge) countBadge.innerText = `0 records logged`;
    }
}

window.telemetryMgr = new TelemetryManager();
