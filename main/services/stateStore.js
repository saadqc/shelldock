const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_STATE } = require('../constants');

function statePath() {
  return path.join(app.getPath('userData'), 'state.json');
}

function loadState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (err) {
    return { ...DEFAULT_STATE };
  }
}

function saveState(currentState, patch) {
  const nextState = { ...currentState, ...patch };
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(nextState, null, 2), 'utf8');
  } catch (err) {
  }
  return nextState;
}

module.exports = {
  loadState,
  saveState,
  statePath
};
