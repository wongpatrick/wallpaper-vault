module.exports = {
    'wallpaper-vault': {
        input: '../backend/openapi.json',
        output: {
            mode: 'tags-split',
            target: 'src/api/generated',
            schemas: 'src/api/model',
            client: 'react-query',
            httpClient: 'axios',
            override: {
                mutator: {
                    path: './src/api/axios-instance.ts',
                    name: 'customInstance'
                }
            }
        }
    }
};