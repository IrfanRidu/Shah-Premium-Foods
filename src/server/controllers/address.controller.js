import AddressModel from "../models/address.model.js";
import UserModel from "../models/user.model.js";

// ADD ADDRESS
export const addAddressController = async (req, res) => {
  try {
    const userId = req.userId;
    const { address_line, city, state, pincode, country, mobile } = req.body;

    if (!address_line || !city || !mobile) {
      return res.status(400).json({
        message: "Address line, city and mobile are required",
        error: true,
        success: false,
      });
    }

    const address = new AddressModel({
      address_line,
      city,
      state,
      pincode,
      country,
      mobile,
      userId,
    });

    const saved = await address.save();

    await UserModel.updateOne(
      { _id: userId },
      { $push: { address_details: saved._id } }
    );

    return res.status(201).json({
      message: "Address added successfully",
      error: false,
      success: true,
      data: saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// GET ADDRESSES
export const getAddressController = async (req, res) => {
  try {
    const userId = req.userId;

    const addresses = await AddressModel.find({ userId, status: true }).sort({
      createdAt: -1,
    });

    return res.json({
      message: "Addresses fetched successfully",
      error: false,
      success: true,
      data: addresses,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// UPDATE ADDRESS
export const updateAddressController = async (req, res) => {
  try {
    const userId = req.userId;
    const { _id, address_line, city, state, pincode, country, mobile } =
      req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Address id is required",
        error: true,
        success: false,
      });
    }

    const updated = await AddressModel.findOneAndUpdate(
      { _id, userId },
      { address_line, city, state, pincode, country, mobile },
      { new: true }
    );

    return res.json({
      message: "Address updated successfully",
      error: false,
      success: true,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// DELETE (soft) ADDRESS
export const deleteAddressController = async (req, res) => {
  try {
    const userId = req.userId;
    const { _id } = req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Address id is required",
        error: true,
        success: false,
      });
    }

    await AddressModel.findOneAndUpdate({ _id, userId }, { status: false });

    return res.json({
      message: "Address removed successfully",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};
