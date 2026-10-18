const { withAppBuildGradle } = require("expo/config-plugins");
// 记录精确解析后的运行时构件，供发布脚本
// 将原生许可证、声明文件及组件坐标放在 APK 旁。
module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    const marker = "// jingkan: release inventory";
    const previous = mod.modResults.contents.indexOf(marker);
    if (previous >= 0)
      mod.modResults.contents = mod.modResults.contents.slice(0, previous);
    mod.modResults.contents += `
${marker}
tasks.register('jingkanReleaseInventory') {
    doLast {
        def records = configurations.releaseRuntimeClasspath.incoming.resolutionResult.allComponents
            .findAll { it.moduleVersion != null }
            .collect { [coordinate: it.moduleVersion.toString()] }
            .unique { it.coordinate }.sort { it.coordinate }
        def output = layout.buildDirectory.file('reports/jingkan-runtime.json').get().asFile
        output.parentFile.mkdirs()
        output.text = groovy.json.JsonOutput.toJson(records)
    }
}
`;
    return mod;
  });
