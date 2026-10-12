require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'pic-sorter-trash'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://example.com'
  s.license        = package['license']
  s.author         = 'PicSorter'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
end
