module.exports = {
    'wallpaper-vault': {
        input: 'http://localhost:8000/openapi.json',
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