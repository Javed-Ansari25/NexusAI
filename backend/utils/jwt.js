import jwt from "jsonwebtoken"

/*
  Generate JWT token and set it as HttpOnly cookie
*/
const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return token;
};

/*
 * Verify JWT token
*/
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export { generateTokenAndSetCookie, verifyToken };