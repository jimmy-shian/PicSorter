const { withAppBuildGradle } = require('expo/config-plugins');
module.exports = config => withAppBuildGradle(config, result => {
  const line = "apply from: new File(rootProject.projectDir, '../signing.gradle')";
  if (!result.modResults.contents.includes(line)) result.modResults.contents += '\n' + line + '\n';
  return result;
});
