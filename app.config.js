module.exports = ({ config }) => {
  const teamId = process.env.EXPO_IOS_TEAM_ID?.trim();
  const bundleIdentifier = process.env.EXPO_IOS_BUNDLE_IDENTIFIER?.trim();

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(teamId ? { appleTeamId: teamId } : {}),
      ...(bundleIdentifier ? { bundleIdentifier } : {}),
    },
  };
};
