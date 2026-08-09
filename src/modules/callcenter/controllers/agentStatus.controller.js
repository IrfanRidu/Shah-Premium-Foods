import { setAgentStatusByUserId, getAgentStatusByUserId, getAllAgentStatuses } from "../services/agentPresenceService.js";
import EmployeeModel from "../../../server/models/employee.model.js";

// The softphone (hooks/useSipClient.js) fetches this before calling
// initSip() — never hardcode SIP credentials client-side. wsServer/
// sipDomain are deployment config (same for every agent), sipUsername/
// sipPassword are this one agent's PJSIP credentials, generated at
// provisioning time (see callCenterAgent.controller.js).
export const getMySipCredentialsController = async (req, res) => {
  try {
    const employee = await EmployeeModel.findOne({ userId: req.userId, isCallCenterAgent: true }).select("sipUsername sipPassword name");
    if (!employee?.sipUsername) {
      return res.status(404).json({ success: false, error: true, message: "No SIP credentials provisioned for this account" });
    }
    if (!process.env.ASTERISK_WS_URL || !process.env.ASTERISK_SIP_DOMAIN) {
      return res.status(503).json({ success: false, error: true, message: "Telephony is not configured on this server yet (ASTERISK_WS_URL / ASTERISK_SIP_DOMAIN)" });
    }
    return res.json({
      success: true, error: false,
      data: {
        sipUri: `sip:${employee.sipUsername}@${process.env.ASTERISK_SIP_DOMAIN}`,
        password: employee.sipPassword,
        wsServer: process.env.ASTERISK_WS_URL,
        sipDomain: process.env.ASTERISK_SIP_DOMAIN,
        displayName: employee.name,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Agent's own current status. The Socket.IO path (socketServer.js) is
// the primary way this updates live, but a plain REST GET is useful for
// the initial page load before the socket has connected.
export const getMyAgentStatusController = async (req, res) => {
  try {
    const status = await getAgentStatusByUserId(req.userId);
    return res.json({ success: true, error: false, data: status });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// REST fallback for setting status (socket is primary, but this covers
// clients that haven't connected the socket yet, or non-browser callers).
export const updateMyAgentStatusController = async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await setAgentStatusByUserId(req.userId, status);
    return res.json({ success: true, error: false, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: true, message: err.message });
  }
};

// Super Admin: "Monitor all agents" / live status board.
export const listAllAgentStatusesController = async (req, res) => {
  try {
    const statuses = await getAllAgentStatuses();
    return res.json({ success: true, error: false, data: statuses });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
