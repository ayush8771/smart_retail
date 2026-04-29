function emitCriticalAlert(io, shelfId, message, occupancy_pct) {
    io.emit('alert:critical', {
        shelfId,
        message,
        occupancy_pct,
        timestamp: new Date().toISOString()
    });
}

function emitWarningAlert(io, shelfId, message, occupancy_pct) {
    io.emit('alert:warning', {
        shelfId,
        message,
        occupancy_pct,
        timestamp: new Date().toISOString()
    });
}

function emitShelfUpdated(io, shelfId, occupancy_pct, status) {
    io.emit('shelf:updated', {
        shelfId,
        occupancy_pct,
        status
    });
}

module.exports = { emitCriticalAlert, emitWarningAlert, emitShelfUpdated };