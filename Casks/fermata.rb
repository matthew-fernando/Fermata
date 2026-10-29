cask "fermata" do
  version "0.1.1"
  sha256 "66257e4900d5675b1a9bb5f88b9496c6dfa3b26481fc631c511bc129f5877518"

  url "https://github.com/matthew-fernando/Fermata/releases/download/v0.1.1/Fermata_0.1.1_universal.dmg"
  name "Fermata"
  desc "Menu bar break timer that earns break time as you work"
  homepage "https://github.com/matthew-fernando/Fermata"

  app "Fermata.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Fermata.app"]
  end

  zap trash: [
    "~/Library/Application Support/com.matthewfernando.fermata",
    "~/Library/Caches/com.matthewfernando.fermata",
    "~/Library/WebKit/com.matthewfernando.fermata",
  ]
end