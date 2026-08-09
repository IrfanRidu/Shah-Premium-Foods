import { getQueueSnapshot } from "../services/queueService.js";

export const getQueueController = async (req, res) => {
  try {
    const queue = await getQueueSnapshot();
    return res.json({ success: true, error: false, data: queue });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
