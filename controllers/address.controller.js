import AddressModel from '../models/address.model.js';
import UserModel from '../models/user.model.js';

export const addAddressController = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    const {
      address_line,
      houseFlat,
      street,
      city,
      state,
      country,
      pincode,
      mobile,
      fullName,
      phone,
      landmark,
      type,
      latitude,
      longitude,
      formattedAddress,
      isDefault,
    } = req.body;

    const resolvedAddressLine = (address_line || houseFlat || street || '').trim();
    if (!resolvedAddressLine) {
      return res.status(400).json({
        success: false,
        message: 'Address Line is required',
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const resolvedPhone = String(mobile || phone || user.phone || '');
    const resolvedState = state || 'Punjab';
    const resolvedCountry = country || 'India';
    const resolvedCity = city || 'Phagwara';
    const resolvedPincode = pincode || '144411';

    const addressData = {
      userId,
      address_line: resolvedAddressLine,
      fullName: fullName || user.name || 'Customer',
      phone: resolvedPhone,
      mobile: resolvedPhone ? Number(resolvedPhone.replace(/[^0-9]/g, '')) || null : null,
      houseFlat: houseFlat || resolvedAddressLine,
      street: street || resolvedAddressLine,
      city: resolvedCity,
      state: resolvedState,
      country: resolvedCountry,
      pincode: resolvedPincode,
      landmark: landmark || '',
      type: type || 'Home',
      latitude: Number(latitude || 31.2554),
      longitude: Number(longitude || 75.7052),
      formattedAddress: formattedAddress || `${resolvedAddressLine}, ${resolvedState}, ${resolvedCountry}`,
      isDefault: Boolean(isDefault),
    };

    if (!user.addresses) user.addresses = [];

    if (addressData.isDefault) {
      user.addresses.forEach((a) => {
        a.isDefault = false;
      });
    } else if (user.addresses.length === 0) {
      addressData.isDefault = true;
    }

    user.addresses.push(addressData);
    user.markModified('addresses');
    await user.save();

    const createdAddress = await AddressModel.create(addressData);
    if (!user.address_details) user.address_details = [];
    user.address_details.push(createdAddress._id);
    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Address added successfully',
      addresses: user.addresses,
      address: createdAddress,
    });
  } catch (error) {
    next(error);
  }
};

export const addAddress = addAddressController;

export const getAddressController = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      addresses: user.addresses || [],
    });
  } catch (error) {
    next(error);
  }
};

export const getAddresses = getAddressController;

export const updateAddressController = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    const addressId = req.params.addressId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const address = user.addresses?.find((a) => a._id.toString() === addressId);
    if (address) {
      if (req.body.isDefault) {
        user.addresses.forEach((a) => {
          a.isDefault = false;
        });
      }
      Object.assign(address, req.body);
      user.markModified('addresses');
      await user.save();
    }

    await AddressModel.findByIdAndUpdate(addressId, req.body, { new: true });

    return res.json({
      success: true,
      message: 'Address updated successfully',
      addresses: user.addresses,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAddress = updateAddressController;

export const deleteAddressController = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    const addressId = req.params.addressId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.addresses = (user.addresses || []).filter(
      (a) => a._id.toString() !== addressId
    );
    user.markModified('addresses');
    await user.save();

    await AddressModel.findByIdAndDelete(addressId);

    return res.json({
      success: true,
      message: 'Address deleted successfully',
      addresses: user.addresses,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAddress = deleteAddressController;
