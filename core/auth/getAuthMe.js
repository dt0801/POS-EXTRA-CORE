/**
 * @param {{ id: number, username: string, role: string, full_name: string }} user - req.user
 */
function getAuthMe(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
  };
}

module.exports = { getAuthMe };
