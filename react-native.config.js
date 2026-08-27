module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "./android",
        packageImportPath: "import com.tapapplink.reactnative.TapAppLinkPackage;",
        packageInstance: "new TapAppLinkPackage()",
      },
      ios: null,
    },
  },
};
