/* eslint-disable */
export default {
  displayName: "gpt-gateway-admin",
  preset: "../../jest.preset.js",
  transform: {
    "^(?!.*\\.(js|jsx|ts|tsx|css|json)$)": "@nrwl/react/plugins/jest",
    "^.+\\.[tj]sx?$": "babel-jest",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  coverageDirectory: "../../coverage/packages/gpt-gateway-admin",
  coverageThreshold: {
    global: {
      branches: 0,
      lines: 0,
    },
  },
};
